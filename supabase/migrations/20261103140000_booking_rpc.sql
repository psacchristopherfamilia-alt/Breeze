-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 007 · Reservas y disponibilidad (RPC)
--   Las citas SOLO se escriben aquí. La exclusion constraint sigue siendo la última
--   defensa contra la doble reserva; estas funciones validan todo lo demás.
-- ════════════════════════════════════════════════════════════════════════════

-- Las restricciones anti-solape pasan a ser DEFERRABLE (INITIALLY IMMEDIATE: siguen
-- comprobándose al instante). Solo reprogramar una reserva de varios servicios las difiere
-- dentro de la función, para mover todas sus citas a la vez sin chocar consigo misma.
alter table public.appointments
  drop constraint appointments_no_double_booking,
  drop constraint appointments_no_customer_overlap;

alter table public.appointments
  add constraint appointments_no_double_booking exclude using gist (
    professional_id with =,
    (tstzrange(starts_at, blocked_until, '[)')) with &&
  ) where (status <> 'cancelled') deferrable initially immediate,
  add constraint appointments_no_customer_overlap exclude using gist (
    customer_id with =,
    (tstzrange(starts_at, ends_at, '[)')) with &&
  ) where (status <> 'cancelled') deferrable initially immediate;

-- ─── Helpers internos ──────────────────────────────────────────────────────

-- ¿El bloque [inicio, fin+buffer) cabe en un tramo laboral del profesional (hora local del salón)
-- y no pisa días libres ni cierres de la sucursal?
create or replace function private.fits_schedule(
  p_professional_id uuid, p_salon_id uuid, p_tz text, p_start timestamptz, p_blocked_until timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.working_hours wh
       where wh.professional_id = p_professional_id
         and wh.weekday = extract(dow from (p_start at time zone p_tz))::int
         and (p_start at time zone p_tz) >= (p_start at time zone p_tz)::date + wh.start_time
         and (p_blocked_until at time zone p_tz) <= (p_start at time zone p_tz)::date + wh.end_time
    )
    and not exists (
      select 1 from public.time_off t
       where t.professional_id = p_professional_id
         and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_blocked_until, '[)')
    )
    and not exists (
      select 1 from public.salon_closures sc
       where sc.salon_id = p_salon_id
         and tstzrange(sc.starts_at, sc.ends_at, '[)') && tstzrange(p_start, p_blocked_until, '[)')
    );
$$;

-- Convierte [{service_id, professional_id}, …] en citas consecutivas a partir de p_start.
-- Cada servicio empieza cuando termina el anterior + su buffer.
create or replace function private.plan_items(p_salon_id uuid, p_items jsonb, p_start timestamptz)
returns table (
  idx integer,
  professional_id uuid,
  service_id uuid,
  service_name_en text,
  service_name_es text,
  price_cents integer,
  starts_at timestamptz,
  ends_at timestamptz,
  blocked_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_t timestamptz := p_start;
  v_i integer := 0;
  v_dur integer;
  v_price integer;
  v_svc public.services;
  v_pro public.professionals;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 5 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    select * into v_svc from public.services s
     where s.id = (v_item ->> 'service_id')::uuid and s.salon_id = p_salon_id and s.is_active;
    select * into v_pro from public.professionals p
     where p.id = (v_item ->> 'professional_id')::uuid and p.salon_id = p_salon_id and p.is_active;
    if v_svc.id is null or v_pro.id is null then
      raise exception 'invalid_items' using errcode = '22023';
    end if;

    select coalesce(ps.duration_min_override, v_svc.duration_min), coalesce(ps.price_cents_override, v_svc.price_cents)
      into v_dur, v_price
      from public.professional_services ps
     where ps.professional_id = v_pro.id and ps.service_id = v_svc.id;
    if v_dur is null then
      raise exception 'service_not_offered' using errcode = 'P0001';
    end if;

    idx := v_i;
    professional_id := v_pro.id;
    service_id := v_svc.id;
    service_name_en := v_svc.name_en;
    service_name_es := v_svc.name_es;
    price_cents := v_price;
    starts_at := v_t;
    ends_at := v_t + make_interval(mins => v_dur);
    blocked_until := ends_at + make_interval(mins => v_svc.buffer_min);
    return next;
    v_t := blocked_until;
  end loop;
end;
$$;

-- Ficha de cliente para esta organización: la del usuario con sesión, o la del invitado (por teléfono).
create or replace function private.resolve_customer(p_org uuid, p_guest jsonb)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_customer public.customers;
  v_phone text;
  v_first text;
  v_last text;
begin
  if v_user is not null then
    select * into v_customer from public.customers where organization_id = p_org and user_id = v_user;
    if found then
      return v_customer;
    end if;
    select * into v_profile from public.profiles where id = v_user;
    v_phone := coalesce(v_profile.phone, private.normalize_phone(p_guest ->> 'phone'));
    if v_phone is null then
      raise exception 'phone_required' using errcode = 'P0001';
    end if;
    v_first := coalesce(nullif(split_part(btrim(v_profile.full_name), ' ', 1), ''), nullif(btrim(p_guest ->> 'first_name'), ''));
    v_last := coalesce(nullif(btrim(substr(btrim(v_profile.full_name), length(split_part(btrim(v_profile.full_name), ' ', 1)) + 1)), ''),
                       btrim(coalesce(p_guest ->> 'last_name', '')));
    if v_first is null then
      raise exception 'name_required' using errcode = 'P0001';
    end if;
    insert into public.customers (organization_id, user_id, first_name, last_name, phone, email, locale, whatsapp_opt_in)
    values (p_org, v_user, v_first, v_last, v_phone, v_profile.email, v_profile.locale,
            coalesce((p_guest ->> 'whatsapp_opt_in')::boolean, false))
    returning * into v_customer;
    return v_customer;
  end if;

  -- Invitado (turista sin cuenta)
  v_first := nullif(btrim(p_guest ->> 'first_name'), '');
  v_phone := private.normalize_phone(p_guest ->> 'phone');
  if v_first is null then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if v_phone is null then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;
  select * into v_customer from public.customers
   where organization_id = p_org and user_id is null and phone = v_phone
   order by created_at limit 1;
  if found then
    return v_customer;
  end if;
  insert into public.customers (organization_id, first_name, last_name, phone, email, locale, whatsapp_opt_in)
  values (p_org, v_first, btrim(coalesce(p_guest ->> 'last_name', '')), v_phone,
          nullif(lower(btrim(p_guest ->> 'email')), ''),
          case when p_guest ->> 'locale' = 'es' then 'es'::public.app_locale else 'en'::public.app_locale end,
          coalesce((p_guest ->> 'whatsapp_opt_in')::boolean, false))
  returning * into v_customer;
  return v_customer;
end;
$$;

-- ¿Puede el cliente cambiar/cancelar todavía? (ventana de cancelación del salón)
create or replace function private.within_change_window(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(min(a.starts_at), now()) - now() >= make_interval(hours => s.cancellation_window_hours)
    from public.booking_groups bg
    join public.salons s on s.id = bg.salon_id
    left join public.appointments a on a.booking_group_id = bg.id and a.status = 'booked'
   where bg.id = p_group
   group by s.cancellation_window_hours;
$$;

-- Permisos sobre una reserva: 'staff' (dueño/admin/profesional de la cita), 'customer' (dueño de la reserva) o null.
create or replace function private.booking_access(p_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.has_salon_role(bg.salon_id, '{owner,admin}') then 'staff'
    when exists (select 1 from public.appointments a
                  where a.booking_group_id = bg.id
                    and a.professional_id in (select private.my_professional_ids())) then 'staff'
    when bg.customer_id in (select private.my_customer_ids()) then 'customer'
    else null
  end
  from public.booking_groups bg where bg.id = p_group;
$$;

create or replace function private.group_by_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.booking_groups
   where guest_token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
$$;

-- ─── Disponibilidad pública ────────────────────────────────────────────────
-- Horarios + rangos ocupados (sin ningún dato de clientes) para calcular huecos en el navegador.
create or replace function public.get_public_schedule(p_salon_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if not found or not (v_salon.is_published or private.has_salon_role(p_salon_id, '{owner,admin,professional}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'timezone', v_salon.timezone,
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'hours', coalesce((
                 select jsonb_agg(jsonb_build_object('weekday', wh.weekday, 'start', to_char(wh.start_time, 'HH24:MI'), 'end', to_char(wh.end_time, 'HH24:MI'))
                                  order by wh.weekday, wh.start_time)
                   from public.working_hours wh where wh.professional_id = p.id), '[]'::jsonb)))
        from public.professionals p
       where p.salon_id = p_salon_id and p.is_active and p.accepts_online), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object('professional_id', b.professional_id, 'start', b.s, 'end', b.e) order by b.s)
        from (
          select a.professional_id, a.starts_at as s, a.blocked_until as e
            from public.appointments a
           where a.salon_id = p_salon_id and a.status <> 'cancelled'
             and a.starts_at < p_to and a.blocked_until > p_from
          union all
          select t.professional_id, t.starts_at, t.ends_at
            from public.time_off t join public.professionals p on p.id = t.professional_id
           where p.salon_id = p_salon_id and t.starts_at < p_to and t.ends_at > p_from
          union all
          select p.id, sc.starts_at, sc.ends_at
            from public.salon_closures sc join public.professionals p on p.salon_id = sc.salon_id
           where sc.salon_id = p_salon_id and sc.starts_at < p_to and sc.ends_at > p_from
        ) b), '[]'::jsonb)
  );
end;
$$;

-- ─── Reservar (cliente con cuenta o invitado) ──────────────────────────────
create or replace function public.book_appointment(
  p_salon_id uuid,
  p_items jsonb,           -- [{ "service_id": …, "professional_id": … }, …] en orden
  p_starts_at timestamptz,
  p_guest jsonb default null -- invitado: { first_name, last_name, phone, email, locale, whatsapp_opt_in }
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_sub public.subscriptions;
  v_customer public.customers;
  v_is_guest boolean := auth.uid() is null;
  v_token text;
  v_group uuid;
  v_ids uuid[] := '{}';
  v_item record;
  v_id uuid;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  select * into v_sub from public.subscriptions where organization_id = v_salon.organization_id;
  if v_salon.id is null or not v_salon.is_published
     or v_sub.status is null or v_sub.status in ('suspended', 'cancelled')
     or (v_sub.status = 'trialing' and v_sub.trial_ends_at < now()) then
    raise exception 'salon_not_bookable' using errcode = 'P0001';
  end if;
  if p_starts_at < now() + make_interval(mins => v_salon.min_lead_time_min) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if p_starts_at > now() + make_interval(days => v_salon.max_advance_days) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  v_customer := private.resolve_customer(v_salon.organization_id, p_guest);
  if v_salon.no_show_block_enabled
     and (v_customer.is_blocked or v_customer.no_show_count >= v_salon.no_show_threshold) then
    raise exception 'customer_blocked' using errcode = 'P0001';
  end if;
  if v_is_guest and (
    select count(distinct a.booking_group_id) from public.appointments a
     where a.customer_id = v_customer.id and a.status = 'booked' and a.starts_at > now()
  ) >= 2 then
    raise exception 'guest_limit' using errcode = 'P0001';
  end if;

  if v_is_guest then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;
  insert into public.booking_groups (organization_id, salon_id, customer_id, source, guest_token_hash, created_by)
  values (v_salon.organization_id, v_salon.id, v_customer.id, 'online',
          case when v_token is not null then sha256(convert_to(v_token, 'UTF8')) end, auth.uid())
  returning id into v_group;

  for v_item in select * from private.plan_items(p_salon_id, p_items, p_starts_at) loop
    if not exists (select 1 from public.professionals where id = v_item.professional_id and accepts_online) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if not private.fits_schedule(v_item.professional_id, v_salon.id, v_salon.timezone, v_item.starts_at, v_item.blocked_until) then
      raise exception 'outside_working_hours' using errcode = 'P0001';
    end if;
    insert into public.appointments
      (booking_group_id, salon_id, professional_id, customer_id, service_id, service_name_en, service_name_es,
       price_cents, starts_at, ends_at, blocked_until)
    values
      (v_group, v_salon.id, v_item.professional_id, v_customer.id, v_item.service_id, v_item.service_name_en,
       v_item.service_name_es, v_item.price_cents, v_item.starts_at, v_item.ends_at, v_item.blocked_until)
    returning id into v_id;   -- ← aquí salta 23P01 si el hueco acaba de ocuparse
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('booking_group_id', v_group, 'appointment_ids', to_jsonb(v_ids), 'guest_token', v_token);
end;
$$;

-- ─── Cita creada por el salón (teléfono / sin cita) ────────────────────────
create or replace function public.staff_create_appointment(
  p_salon_id uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_customer jsonb,                 -- { customer_id } o { first_name, last_name, phone, email }
  p_source public.booking_source default 'phone',
  p_allow_outside_hours boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_customer public.customers;
  v_group uuid;
  v_ids uuid[] := '{}';
  v_item record;
  v_id uuid;
  v_phone text;
  v_is_manager boolean;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if v_salon.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_is_manager := private.has_salon_role(p_salon_id, '{owner,admin}');
  -- Un profesional solo puede agendarse a sí mismo.
  if not v_is_manager and not (
    exists (select 1 from jsonb_array_elements(p_items))
    and not exists (
      select 1 from jsonb_array_elements(p_items) e
       where (e.value ->> 'professional_id')::uuid not in (select private.my_professional_ids())
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source = 'online' then
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  if p_customer ? 'customer_id' then
    select * into v_customer from public.customers
     where id = (p_customer ->> 'customer_id')::uuid and organization_id = v_salon.organization_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    v_phone := private.normalize_phone(p_customer ->> 'phone');
    if nullif(btrim(p_customer ->> 'first_name'), '') is null then
      raise exception 'name_required' using errcode = 'P0001';
    end if;
    if v_phone is null then
      raise exception 'phone_required' using errcode = 'P0001';
    end if;
    select * into v_customer from public.customers
     where organization_id = v_salon.organization_id and phone = v_phone
     order by user_id nulls last, created_at limit 1;
    if not found then
      insert into public.customers (organization_id, first_name, last_name, phone, email)
      values (v_salon.organization_id, btrim(p_customer ->> 'first_name'), btrim(coalesce(p_customer ->> 'last_name', '')),
              v_phone, nullif(lower(btrim(p_customer ->> 'email')), ''))
      returning * into v_customer;
    end if;
  end if;

  insert into public.booking_groups (organization_id, salon_id, customer_id, source, created_by)
  values (v_salon.organization_id, v_salon.id, v_customer.id, p_source, auth.uid())
  returning id into v_group;

  for v_item in select * from private.plan_items(p_salon_id, p_items, p_starts_at) loop
    if not (p_allow_outside_hours and v_is_manager)
       and not private.fits_schedule(v_item.professional_id, v_salon.id, v_salon.timezone, v_item.starts_at, v_item.blocked_until) then
      raise exception 'outside_working_hours' using errcode = 'P0001';
    end if;
    insert into public.appointments
      (booking_group_id, salon_id, professional_id, customer_id, service_id, service_name_en, service_name_es,
       price_cents, starts_at, ends_at, blocked_until)
    values
      (v_group, v_salon.id, v_item.professional_id, v_customer.id, v_item.service_id, v_item.service_name_en,
       v_item.service_name_es, v_item.price_cents, v_item.starts_at, v_item.ends_at, v_item.blocked_until)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('booking_group_id', v_group, 'appointment_ids', to_jsonb(v_ids), 'customer_id', v_customer.id);
end;
$$;

-- ─── Cancelar ──────────────────────────────────────────────────────────────
create or replace function private.cancel_group(p_group uuid, p_enforce_window boolean, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not exists (select 1 from public.appointments where booking_group_id = p_group and status = 'booked' and starts_at > now()) then
    raise exception 'nothing_to_cancel' using errcode = 'P0001';
  end if;
  if p_enforce_window and not private.within_change_window(p_group) then
    raise exception 'outside_change_window' using errcode = 'P0001';
  end if;
  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(btrim(p_reason), '')
   where booking_group_id = p_group and status = 'booked' and starts_at > now();
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'nothing_to_cancel' using errcode = 'P0001';
  end if;
  return v_n;
end;
$$;

create or replace function public.cancel_booking(p_booking_group_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access text := private.booking_access(p_booking_group_id);
begin
  if v_access is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.cancel_group(p_booking_group_id, v_access = 'customer', p_reason);
end;
$$;

create or replace function public.cancel_by_guest_token(p_token text, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.group_by_token(p_token);
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.cancel_group(v_group, true, p_reason);
end;
$$;

-- ─── Reprogramar ───────────────────────────────────────────────────────────
-- Mueve TODA la reserva (mismos servicios, mismos profesionales, en secuencia) a p_new_start.
create or replace function private.reschedule_group(p_group uuid, p_new_start timestamptz, p_as_customer boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_t timestamptz := p_new_start;
  v_a record;
  v_new_end timestamptz;
  v_new_blocked timestamptz;
begin
  select s.* into v_salon from public.salons s join public.booking_groups bg on bg.salon_id = s.id where bg.id = p_group;
  if not exists (select 1 from public.appointments where booking_group_id = p_group and status = 'booked' and starts_at > now()) then
    raise exception 'nothing_to_reschedule' using errcode = 'P0001';
  end if;
  if p_as_customer then
    if not private.within_change_window(p_group) then
      raise exception 'outside_change_window' using errcode = 'P0001';
    end if;
    if p_new_start < now() + make_interval(mins => v_salon.min_lead_time_min) then
      raise exception 'too_soon' using errcode = 'P0001';
    end if;
    if p_new_start > now() + make_interval(days => v_salon.max_advance_days) then
      raise exception 'too_far' using errcode = 'P0001';
    end if;
  elsif p_new_start < now() then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;

  -- Diferimos las restricciones solo mientras movemos las citas de ESTA reserva…
  set constraints public.appointments_no_double_booking, public.appointments_no_customer_overlap deferred;

  for v_a in
    select id, professional_id, starts_at, ends_at, blocked_until from public.appointments
     where booking_group_id = p_group and status = 'booked'
     order by starts_at
  loop
    v_new_end := v_t + (v_a.ends_at - v_a.starts_at);
    v_new_blocked := v_new_end + (v_a.blocked_until - v_a.ends_at);
    if not private.fits_schedule(v_a.professional_id, v_salon.id, v_salon.timezone, v_t, v_new_blocked) then
      raise exception 'outside_working_hours' using errcode = 'P0001';
    end if;
    update public.appointments
       set starts_at = v_t, ends_at = v_new_end, blocked_until = v_new_blocked
     where id = v_a.id;
    v_t := v_new_blocked;
  end loop;

  -- …y las comprobamos YA (si el nuevo hueco choca con otra persona, falla aquí con 23P01).
  set constraints public.appointments_no_double_booking, public.appointments_no_customer_overlap immediate;
  return p_new_start;
end;
$$;

create or replace function public.reschedule_booking(p_booking_group_id uuid, p_new_start timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access text := private.booking_access(p_booking_group_id);
begin
  if v_access is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.reschedule_group(p_booking_group_id, p_new_start, v_access = 'customer');
end;
$$;

create or replace function public.reschedule_by_guest_token(p_token text, p_new_start timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.group_by_token(p_token);
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.reschedule_group(v_group, p_new_start, true);
end;
$$;

-- ─── Completada / no-show (personal) ───────────────────────────────────────
create or replace function public.mark_appointment(p_appointment_id uuid, p_status public.appointment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_salon public.salons;
  v_count integer;
begin
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if v_a.id is null or not (
    private.has_salon_role(v_a.salon_id, '{owner,admin}')
    or v_a.professional_id in (select private.my_professional_ids())
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_status not in ('completed', 'no_show') or v_a.status <> 'booked' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_a.starts_at > now() then
    raise exception 'not_started' using errcode = 'P0001';
  end if;

  update public.appointments set status = p_status where id = v_a.id;

  if p_status = 'no_show' then
    select * into v_salon from public.salons where id = v_a.salon_id;
    update public.customers set no_show_count = no_show_count + 1
     where id = v_a.customer_id returning no_show_count into v_count;
    if v_salon.no_show_block_enabled and v_count >= v_salon.no_show_threshold then
      update public.customers set is_blocked = true where id = v_a.customer_id;
    end if;
  end if;
end;
$$;

-- ─── Consultas para la app ─────────────────────────────────────────────────
create or replace function private.booking_json(p_group uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_group_id', bg.id,
    'source', bg.source,
    'salon', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'phone', s.phone, 'address', s.address,
                                'timezone', s.timezone, 'cancellation_window_hours', s.cancellation_window_hours),
    'customer_display', private.short_name(c.first_name, c.last_name),
    'can_change', coalesce(private.within_change_window(bg.id), false),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'appointment_id', a.id, 'service_id', a.service_id,
               'service_name_en', a.service_name_en, 'service_name_es', a.service_name_es,
               'price_cents', a.price_cents, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
               'professional', jsonb_build_object('id', p.id, 'public_name', p.public_name, 'initials', p.initials, 'color_hex', p.color_hex))
             order by a.starts_at)
        from public.appointments a join public.professionals p on p.id = a.professional_id
       where a.booking_group_id = bg.id), '[]'::jsonb)
  )
  from public.booking_groups bg
  join public.salons s on s.id = bg.salon_id
  join public.customers c on c.id = bg.customer_id
  where bg.id = p_group;
$$;

-- Página /b/[token] del invitado.
create or replace function public.get_guest_booking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.group_by_token(p_token);
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.booking_json(v_group);
end;
$$;

-- "Mis citas" del cliente con sesión (en todas las organizaciones).
create or replace function public.my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.booking_json(g.id) order by g.first_start desc), '[]'::jsonb)
    from (
      select bg.id, min(a.starts_at) as first_start
        from public.booking_groups bg
        join public.appointments a on a.booking_group_id = bg.id
       where bg.customer_id in (select private.my_customer_ids())
       group by bg.id
    ) g;
$$;

-- ─── Permisos de ejecución ─────────────────────────────────────────────────
revoke execute on function public.get_public_schedule(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.book_appointment(uuid, jsonb, timestamptz, jsonb) from public;
revoke execute on function public.staff_create_appointment(uuid, jsonb, timestamptz, jsonb, public.booking_source, boolean) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.cancel_by_guest_token(text, text) from public;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.reschedule_by_guest_token(text, timestamptz) from public;
revoke execute on function public.mark_appointment(uuid, public.appointment_status) from public, anon;
revoke execute on function public.get_guest_booking(text) from public;
revoke execute on function public.my_bookings() from public, anon;

-- Visitantes (turistas): ver disponibilidad, reservar como invitado y gestionar con su enlace.
grant execute on function public.get_public_schedule(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.book_appointment(uuid, jsonb, timestamptz, jsonb) to anon, authenticated;
grant execute on function public.cancel_by_guest_token(text, text) to anon, authenticated;
grant execute on function public.reschedule_by_guest_token(text, timestamptz) to anon, authenticated;
grant execute on function public.get_guest_booking(text) to anon, authenticated;
-- Con sesión.
grant execute on function public.staff_create_appointment(uuid, jsonb, timestamptz, jsonb, public.booking_source, boolean) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.mark_appointment(uuid, public.appointment_status) to authenticated;
grant execute on function public.my_bookings() to authenticated;
