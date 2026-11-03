-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 009 · Breeze Live (pantalla en vivo)
--   · La TV entra con una sesión ANÓNIMA de Supabase y muestra un código de 6 dígitos.
--   · El dueño/admin escribe ese código en el panel → la TV pasa a tener rol "display".
--   · get_live_board: agenda del día YA SANEADA ("Juan P.", servicio, hora). Nunca teléfono ni correo.
--   · Cada cambio de cita se emite por Realtime Broadcast (canal privado live:<salon_id>).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Sesiones anónimas: solo sirven para pantallas ─────────────────────────
create or replace function private.is_anonymous_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false);
$$;

-- Un usuario anónimo (una TV) no puede crear negocios, aceptar invitaciones ni ser cliente.
-- Se bloquea en las propias tablas, así cubre RPC y escrituras directas.
create or replace function private.block_anonymous()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  -- Cada rama solo toca columnas que existen en su tabla.
  if tg_table_name = 'organizations' then
    v_user := new.owner_id;
  elsif tg_table_name = 'memberships' then
    if new.role = 'display' then
      return new; -- la pantalla emparejada sí puede tener su membresía
    end if;
    v_user := new.user_id;
  else
    v_user := new.user_id;
  end if;
  if v_user is not null and private.is_anonymous_user(v_user) then
    raise exception 'anonymous_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_block_anonymous before insert on public.organizations
  for each row execute function private.block_anonymous();
create trigger memberships_block_anonymous before insert or update on public.memberships
  for each row execute function private.block_anonymous();
create trigger customers_block_anonymous before insert or update of user_id on public.customers
  for each row execute function private.block_anonymous();

-- ─── Emparejamiento ────────────────────────────────────────────────────────

create or replace function private.pairing_hash(p_salon uuid, p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(p_salon::text || ':' || coalesce(p_code, ''), 'UTF8'));
$$;

-- Estado de esta pantalla/usuario para una sucursal (por slug).
--   staff   → personal con sesión normal (puede ver Live directamente)
--   paired  → TV emparejada
--   pending → TV esperando que el salón escriba su código
--   none    → nada todavía
create or replace function public.live_device_status(p_salon_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_dev public.live_devices;
begin
  select * into v_salon from public.salons where slug = p_salon_slug;
  if not found or auth.uid() is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.has_salon_role(v_salon.id, '{owner,admin,professional}') then
    return jsonb_build_object('status', 'staff', 'salon_id', v_salon.id, 'salon_name', v_salon.name);
  end if;
  select * into v_dev from public.live_devices
   where salon_id = v_salon.id and user_id = auth.uid() and revoked_at is null
   order by created_at desc limit 1;
  return jsonb_build_object(
    'status', case
                when v_dev.id is null then 'none'
                when v_dev.paired_at is not null and private.has_salon_role(v_salon.id, '{display}') then 'paired'
                when v_dev.pairing_expires_at > now() then 'pending'
                else 'none'
              end,
    'salon_id', v_salon.id,
    'salon_name', v_salon.name,
    'expires_at', v_dev.pairing_expires_at
  );
end;
$$;

-- La TV (sesión anónima) pide un código. Devuelve el código EN CLARO una vez; en BD solo su hash.
create or replace function public.request_live_pairing(p_salon_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_code text;
  v_dev uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_salon from public.salons where slug = p_salon_slug;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Antiabuso: como mucho 5 pantallas esperando código a la vez por sucursal.
  if (select count(*) from public.live_devices
       where salon_id = v_salon.id and paired_at is null and revoked_at is null
         and pairing_expires_at > now() and user_id is distinct from auth.uid()) >= 5 then
    raise exception 'too_many_pending' using errcode = 'P0001';
  end if;

  -- Código de 6 dígitos (aleatorio criptográfico) que no choque con otro pendiente.
  loop
    v_code := lpad((abs(('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::int) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.live_devices
       where salon_id = v_salon.id and pairing_code_hash = private.pairing_hash(v_salon.id, v_code)
         and paired_at is null and pairing_expires_at > now()
    );
  end loop;

  -- Una sola pantalla pendiente por usuario/sucursal: se reutiliza con un código nuevo.
  update public.live_devices
     set pairing_code_hash = private.pairing_hash(v_salon.id, v_code),
         pairing_expires_at = now() + interval '15 minutes'
   where salon_id = v_salon.id and user_id = auth.uid() and paired_at is null and revoked_at is null
  returning id into v_dev;
  if v_dev is null then
    insert into public.live_devices (salon_id, user_id, pairing_code_hash, pairing_expires_at)
    values (v_salon.id, auth.uid(), private.pairing_hash(v_salon.id, v_code), now() + interval '15 minutes');
  end if;

  return jsonb_build_object('code', v_code, 'salon_id', v_salon.id, 'salon_name', v_salon.name,
                            'expires_at', now() + interval '15 minutes');
end;
$$;

-- El dueño/admin escribe en el panel el código que muestra la TV.
create or replace function public.pair_live_device(p_salon_id uuid, p_code text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.live_devices;
  v_org uuid;
begin
  if not private.has_salon_role(p_salon_id, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_dev from public.live_devices
   where salon_id = p_salon_id
     and pairing_code_hash = private.pairing_hash(p_salon_id, regexp_replace(coalesce(p_code, ''), '\D', '', 'g'))
     and paired_at is null and revoked_at is null and pairing_expires_at > now()
   for update;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  select organization_id into v_org from public.salons where id = p_salon_id;
  update public.live_devices
     set paired_at = now(), pairing_code_hash = null, pairing_expires_at = null,
         name = coalesce(nullif(btrim(p_name), ''), name), last_seen_at = now()
   where id = v_dev.id;
  insert into public.memberships (user_id, organization_id, salon_id, role)
  values (v_dev.user_id, v_org, p_salon_id, 'display')
  on conflict do nothing;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id)
  values (auth.uid(), v_org, 'live_device.paired', 'live_devices', v_dev.id);
  return v_dev.id;
end;
$$;

-- Desvincular una pantalla (deja de recibir datos al instante).
create or replace function public.revoke_live_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.live_devices;
begin
  select * into v_dev from public.live_devices where id = p_device_id;
  if not found or not private.has_salon_role(v_dev.salon_id, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.live_devices set revoked_at = now(), pairing_code_hash = null where id = v_dev.id;
  delete from public.memberships where user_id = v_dev.user_id and salon_id = v_dev.salon_id and role = 'display';
end;
$$;

-- ─── Agenda del día para la pantalla (saneada en la BD) ────────────────────
create or replace function public.get_live_board(p_salon_id uuid, p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_day date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.has_salon_role(p_salon_id, '{owner,admin,professional,display}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_salon from public.salons where id = p_salon_id;
  v_day := coalesce(p_day, (now() at time zone v_salon.timezone)::date);
  v_from := v_day::timestamp at time zone v_salon.timezone;
  v_to := (v_day + 1)::timestamp at time zone v_salon.timezone;

  update public.live_devices set last_seen_at = now()
   where salon_id = p_salon_id and user_id = auth.uid() and revoked_at is null;

  return jsonb_build_object(
    'salon', jsonb_build_object('id', v_salon.id, 'name', v_salon.name, 'slug', v_salon.slug, 'timezone', v_salon.timezone),
    'day', v_day,
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'public_name', p.public_name, 'initials', p.initials, 'color_hex', p.color_hex)
                       order by p.sort_order, p.created_at)
        from public.professionals p where p.salon_id = p_salon_id and p.is_active), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(private.live_appointment_json(a) order by a.starts_at)
        from public.appointments a
       where a.salon_id = p_salon_id and a.status <> 'cancelled'
         and a.starts_at >= v_from and a.starts_at < v_to), '[]'::jsonb)
  );
end;
$$;

-- Lo ÚNICO que sale de una cita hacia una pantalla pública.
create or replace function private.live_appointment_json(a public.appointments)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'booking_group_id', a.booking_group_id,
    'professional_id', a.professional_id,
    'customer_display', a.customer_display,
    'service_name_en', a.service_name_en,
    'service_name_es', a.service_name_es,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'status', a.status,
    'created_at', a.created_at
  );
$$;

-- ─── Tiempo real: la BD avisa a las pantallas en cada cambio de cita ───────
create or replace function private.broadcast_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  -- Solo si existe Realtime (en Supabase sí; en el Postgres de tests hay un sustituto).
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return null;
  end if;
  v_type := case
    when tg_op = 'INSERT' then 'booked'
    when new.status = 'cancelled' and old.status is distinct from 'cancelled' then 'cancelled'
    when new.starts_at is distinct from old.starts_at or new.professional_id is distinct from old.professional_id then 'rescheduled'
    else 'updated'
  end;
  execute 'select realtime.send($1, $2, $3, true)'
    using jsonb_build_object('type', v_type, 'appointment', private.live_appointment_json(new)),
          'appointment',
          'live:' || new.salon_id::text;
  return null;
end;
$$;

create trigger appointments_broadcast_live
  after insert or update of status, starts_at, ends_at, professional_id on public.appointments
  for each row execute function private.broadcast_appointment();

-- Autorización de los canales privados de Realtime: solo personal o pantallas de ESA sucursal.
create or replace function private.live_topic_salon(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_topic ~ '^live:[0-9a-f-]{36}$' then substr(p_topic, 6)::uuid end;
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "breeze live: leer el canal de su sucursal" on realtime.messages
        for select to authenticated
        using (private.has_salon_role(private.live_topic_salon((select realtime.topic())), '{owner,admin,professional,display}'))
    $p$;
  end if;
end $$;

-- ─── Permisos ──────────────────────────────────────────────────────────────
revoke execute on function public.live_device_status(text) from public, anon;
revoke execute on function public.request_live_pairing(text) from public, anon;
revoke execute on function public.pair_live_device(uuid, text, text) from public, anon;
revoke execute on function public.revoke_live_device(uuid) from public, anon;
revoke execute on function public.get_live_board(uuid, date) from public, anon;
grant execute on function public.live_device_status(text) to authenticated;
grant execute on function public.request_live_pairing(text) to authenticated;
grant execute on function public.pair_live_device(uuid, text, text) to authenticated;
grant execute on function public.revoke_live_device(uuid) to authenticated;
grant execute on function public.get_live_board(uuid, date) to authenticated;
