-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 010 · Notificaciones y recordatorios (firmados como "Breeze")
--   · Un trigger en citas crea los trabajos: confirmación, recordatorios (según
--     salons.reminder_offsets_min, p. ej. 24 h y 2 h antes), aviso de cancelación
--     y de cambio de hora. Uno por RESERVA (no por servicio).
--   · Un worker con la clave service_role los reclama (claim_notification_jobs),
--     los envía (WhatsApp → SMS → correo) y los cierra (complete_notification_job).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.notification_jobs
  add column booking_group_id uuid references public.booking_groups (id) on delete cascade,
  add column link_token text,          -- enlace /b/<token> del invitado; se borra al enviar
  add column locked_until timestamptz; -- reclamado por un worker hasta esta hora

create index notification_jobs_group_idx on public.notification_jobs (booking_group_id, kind, status);

-- El enlace privado del invitado NUNCA se expone al panel (solo lo usa el worker).
revoke select on public.notification_jobs from authenticated;
grant select (id, appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for, status,
              attempts, provider, provider_message_id, error, sent_at, created_at)
  on public.notification_jobs to authenticated;

-- ─── Ficha del invitado al volver a reservar ───────────────────────────────
-- Antes, si el teléfono ya existía, se reutilizaba la ficha IGNORANDO lo que el invitado acababa
-- de elegir (aceptar WhatsApp, su correo, su idioma). Ahora se actualiza con lo último.
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
    update public.customers
       set email = coalesce(nullif(lower(btrim(p_guest ->> 'email')), '')::extensions.citext, email),
           locale = case when p_guest ->> 'locale' in ('en', 'es') then (p_guest ->> 'locale')::public.app_locale else locale end,
           whatsapp_opt_in = coalesce((p_guest ->> 'whatsapp_opt_in')::boolean, whatsapp_opt_in)
     where id = v_customer.id
    returning * into v_customer;
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

-- ─── Encolar ───────────────────────────────────────────────────────────────

-- Canal preferido según lo que aceptó el cliente (el worker puede caer al siguiente).
create or replace function private.preferred_channel(c public.customers)
returns public.notification_channel
language sql
immutable
set search_path = ''
as $$
  select case
    when c.whatsapp_opt_in and c.phone is not null then 'whatsapp'::public.notification_channel
    when c.email is not null then 'email'::public.notification_channel
    else 'sms'::public.notification_channel
  end;
$$;

-- (Re)crea los recordatorios pendientes de una reserva a partir de su primera cita activa.
create or replace function private.schedule_reminders(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.appointments;
  v_salon public.salons;
  v_customer public.customers;
  v_offset integer;
begin
  update public.notification_jobs set status = 'skipped'
   where booking_group_id = p_group and kind = 'reminder' and status = 'pending';

  select * into v_lead from public.appointments
   where booking_group_id = p_group and status = 'booked' order by starts_at limit 1;
  if v_lead.id is null then
    return;
  end if;
  select * into v_salon from public.salons where id = v_lead.salon_id;
  select * into v_customer from public.customers where id = v_lead.customer_id;

  foreach v_offset in array v_salon.reminder_offsets_min loop
    if v_lead.starts_at - make_interval(mins => v_offset) > now() + interval '5 minutes' then
      insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
      values (v_lead.id, p_group, v_lead.salon_id, 'reminder', private.preferred_channel(v_customer), v_customer.locale,
              v_lead.starts_at - make_interval(mins => v_offset));
    end if;
  end loop;
end;
$$;

create or replace function private.enqueue_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_active integer;
begin
  select * into v_customer from public.customers where id = new.customer_id;

  if tg_op = 'INSERT' then
    -- Solo la primera cita de la reserva crea la confirmación (las siguientes son más tarde).
    if new.status = 'booked' and new.starts_at > now() and not exists (
      select 1 from public.notification_jobs where booking_group_id = new.booking_group_id and kind = 'confirmation'
    ) then
      insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
      values (new.id, new.booking_group_id, new.salon_id, 'confirmation', private.preferred_channel(v_customer), v_customer.locale, now());
      perform private.schedule_reminders(new.booking_group_id);
    end if;
    return null;
  end if;

  -- Cancelación: cuando ya no queda ninguna cita activa en la reserva.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select count(*) into v_active from public.appointments
     where booking_group_id = new.booking_group_id and status = 'booked';
    if v_active = 0 then
      update public.notification_jobs set status = 'skipped'
       where booking_group_id = new.booking_group_id and status = 'pending' and kind <> 'cancellation';
      if new.starts_at > now() and not exists (
        select 1 from public.notification_jobs where booking_group_id = new.booking_group_id and kind = 'cancellation'
      ) then
        insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
        values (new.id, new.booking_group_id, new.salon_id, 'cancellation', private.preferred_channel(v_customer), v_customer.locale, now());
      end if;
    end if;
    return null;
  end if;

  -- Cambio de hora: recalcula recordatorios y avisa una sola vez.
  if new.status = 'booked' and new.starts_at is distinct from old.starts_at then
    perform private.schedule_reminders(new.booking_group_id);
    if new.starts_at > now() and not exists (
      select 1 from public.notification_jobs
       where booking_group_id = new.booking_group_id and kind = 'reschedule' and status = 'pending'
    ) then
      insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
      values (new.id, new.booking_group_id, new.salon_id, 'reschedule', private.preferred_channel(v_customer), v_customer.locale, now());
    end if;
  end if;
  return null;
end;
$$;

create trigger appointments_enqueue_notifications
  after insert or update of status, starts_at on public.appointments
  for each row execute function private.enqueue_notifications();

-- El invitado (que tiene el token) adjunta su enlace privado a sus mensajes pendientes.
create or replace function public.attach_guest_link(p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.group_by_token(p_token);
  v_n integer;
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.notification_jobs set link_token = p_token
   where booking_group_id = v_group and status = 'pending';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─── Worker (solo service_role) ────────────────────────────────────────────

-- Reclama hasta p_limit trabajos vencidos (sin pisarse con otro worker) y devuelve todo lo
-- necesario para redactar el mensaje. Los que ya no tienen sentido se marcan 'skipped'.
create or replace function public.claim_notification_jobs(p_limit integer default 25)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_jobs;
  v_customer public.customers;
  v_salon public.salons;
  v_items jsonb;
begin
  for v_job in
    with due as (
      select id from public.notification_jobs
       where status = 'pending' and scheduled_for <= now()
         and (locked_until is null or locked_until < now())
       order by scheduled_for
       limit greatest(1, least(p_limit, 100))
       for update skip locked
    )
    update public.notification_jobs j
       set locked_until = now() + interval '2 minutes', attempts = j.attempts + 1
      from due where j.id = due.id
    returning j.*
  loop
    -- Recordatorio de una reserva que ya no está activa o ya pasó → no se envía.
    if v_job.kind <> 'cancellation' and not exists (
      select 1 from public.appointments
       where booking_group_id = v_job.booking_group_id and status = 'booked' and starts_at > now()
    ) then
      update public.notification_jobs set status = 'skipped', link_token = null, locked_until = null where id = v_job.id;
      continue;
    end if;

    select c.* into v_customer
      from public.customers c join public.booking_groups bg on bg.customer_id = c.id
     where bg.id = v_job.booking_group_id;
    select * into v_salon from public.salons where id = v_job.salon_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'service_name_en', a.service_name_en, 'service_name_es', a.service_name_es,
             'starts_at', a.starts_at, 'ends_at', a.ends_at, 'professional', p.public_name)
           order by a.starts_at), '[]'::jsonb)
      into v_items
      from public.appointments a join public.professionals p on p.id = a.professional_id
     where a.booking_group_id = v_job.booking_group_id
       and (a.status = 'booked' or (v_job.kind = 'cancellation' and a.status = 'cancelled'));

    return next jsonb_build_object(
      'job_id', v_job.id,
      'kind', v_job.kind,
      'channel', v_job.channel,
      'locale', v_job.locale,
      'attempts', v_job.attempts,
      'link_token', v_job.link_token,
      'customer', jsonb_build_object('first_name', v_customer.first_name, 'phone', v_customer.phone,
                                     'email', v_customer.email, 'whatsapp_opt_in', v_customer.whatsapp_opt_in),
      'salon', jsonb_build_object('name', v_salon.name, 'slug', v_salon.slug, 'phone', v_salon.phone,
                                  'address', v_salon.address, 'cancellation_window_hours', v_salon.cancellation_window_hours),
      'items', v_items
    );
  end loop;
end;
$$;

-- Cierra un trabajo: enviado, o fallo con reintento (hasta 3 intentos, con espera creciente).
create or replace function public.complete_notification_job(
  p_job_id uuid,
  p_ok boolean,
  p_channel public.notification_channel default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns public.notification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_jobs;
begin
  select * into v_job from public.notification_jobs where id = p_job_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_ok then
    update public.notification_jobs
       set status = 'sent', sent_at = now(), channel = coalesce(p_channel, channel), provider = p_provider,
           provider_message_id = p_provider_message_id, error = null, link_token = null, locked_until = null
     where id = p_job_id;
    return 'sent';
  end if;
  if v_job.attempts >= 3 then
    update public.notification_jobs
       set status = 'failed', error = left(p_error, 500), link_token = null, locked_until = null, provider = p_provider
     where id = p_job_id;
    return 'failed';
  end if;
  update public.notification_jobs
     set error = left(p_error, 500), provider = p_provider,
         locked_until = now() + make_interval(mins => 5 * v_job.attempts) -- reintento: 5, 10 min…
   where id = p_job_id;
  return 'pending';
end;
$$;

revoke execute on function public.attach_guest_link(text) from public;
revoke execute on function public.claim_notification_jobs(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification_job(uuid, boolean, public.notification_channel, text, text, text) from public, anon, authenticated;
grant execute on function public.attach_guest_link(text) to anon, authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;
grant execute on function public.complete_notification_job(uuid, boolean, public.notification_channel, text, text, text) to service_role;
