-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 004 · Clientes, reservas y citas (con la regla anti doble reserva)
-- ════════════════════════════════════════════════════════════════════════════

-- Ficha de cliente POR ORGANIZACIÓN: compartida entre sus sucursales, invisible para las demás.
-- user_id nulo = invitado (turista sin cuenta).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email extensions.citext,
  locale public.app_locale not null default 'en',
  notes text,
  no_show_count integer not null default 0 check (no_show_count >= 0),
  is_blocked boolean not null default false,
  marketing_opt_in boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);
create index customers_org_phone_idx on public.customers (organization_id, phone);
create index customers_user_idx on public.customers (user_id) where user_id is not null;
create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

-- Una reserva (1..N servicios en secuencia). El cliente y la sucursal son de la MISMA organización
-- (garantizado por las dos FK compuestas).
create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  salon_id uuid not null,
  customer_id uuid not null,
  source public.booking_source not null default 'online',
  guest_token_hash bytea unique, -- sha256 del enlace /b/[token] del invitado
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (salon_id, organization_id) references public.salons (id, organization_id) on delete cascade,
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete restrict,
  unique (id, salon_id),
  unique (id, customer_id)
);
create index booking_groups_customer_idx on public.booking_groups (customer_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  booking_group_id uuid not null,
  salon_id uuid not null,
  professional_id uuid not null,
  customer_id uuid not null,
  service_id uuid,
  -- Copia del servicio en el momento de reservar (si cambia el precio, la cita no cambia).
  service_name_en text not null,
  service_name_es text not null,
  price_cents integer not null check (price_cents >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked_until timestamptz not null, -- = ends_at + buffer del servicio
  status public.appointment_status not null default 'booked',
  customer_display text not null default '', -- "Juan P.", lo rellena un trigger
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (booking_group_id, salon_id) references public.booking_groups (id, salon_id) on delete cascade,
  foreign key (booking_group_id, customer_id) references public.booking_groups (id, customer_id) on delete cascade,
  foreign key (professional_id, salon_id) references public.professionals (id, salon_id) on delete restrict,
  foreign key (service_id, salon_id) references public.services (id, salon_id) on delete set null (service_id),

  constraint appointments_time_order check (ends_at > starts_at and blocked_until >= ends_at),
  constraint appointments_cancel_consistency check ((status = 'cancelled') = (cancelled_at is not null)),

  -- ★ REGLA NO NEGOCIABLE: un profesional no puede tener dos citas activas que se solapen
  --   (contando el buffer). Rango semiabierto [inicio, fin): 10:00–10:30 y 10:30–11:00 NO chocan.
  constraint appointments_no_double_booking exclude using gist (
    professional_id with =,
    (tstzrange(starts_at, blocked_until, '[)')) with &&
  ) where (status <> 'cancelled'),

  -- El mismo cliente no puede estar en dos servicios a la vez (multi-servicio = en secuencia).
  constraint appointments_no_customer_overlap exclude using gist (
    customer_id with =,
    (tstzrange(starts_at, ends_at, '[)')) with &&
  ) where (status <> 'cancelled')
);
create index appointments_salon_start_idx on public.appointments (salon_id, starts_at);
create index appointments_professional_start_idx on public.appointments (professional_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id, starts_at);
create index appointments_group_idx on public.appointments (booking_group_id);

-- Nombre público "Juan P." calculado SIEMPRE en la base de datos.
create or replace function private.appointments_fill_display()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select private.short_name(c.first_name, c.last_name)
    into new.customer_display
    from public.customers c
   where c.id = new.customer_id;
  return new;
end;
$$;
create trigger appointments_fill_display before insert or update of customer_id on public.appointments
  for each row execute function private.appointments_fill_display();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();

-- Historial de cada cita (auditoría + base de métricas).
create table public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  type public.appointment_event_type not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index appointment_events_appointment_idx on public.appointment_events (appointment_id, at);
create index appointment_events_salon_idx on public.appointment_events (salon_id, at desc);

create or replace function private.log_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.appointment_event_type;
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := 'created';
    v_payload := jsonb_build_object('starts_at', new.starts_at, 'professional_id', new.professional_id);
  elsif new.status is distinct from old.status then
    v_type := case new.status
                when 'cancelled' then 'cancelled'
                when 'completed' then 'completed'
                when 'no_show'   then 'no_show'
                else 'status_changed'
              end;
    v_payload := jsonb_build_object('from', old.status, 'to', new.status);
  elsif new.starts_at is distinct from old.starts_at or new.professional_id is distinct from old.professional_id then
    v_type := 'rescheduled';
    v_payload := jsonb_build_object(
      'from', jsonb_build_object('starts_at', old.starts_at, 'professional_id', old.professional_id),
      'to',   jsonb_build_object('starts_at', new.starts_at, 'professional_id', new.professional_id));
  else
    return null;
  end if;

  insert into public.appointment_events (appointment_id, salon_id, type, actor_id, payload)
  values (new.id, new.salon_id, v_type, auth.uid(), v_payload);
  return null;
end;
$$;
create trigger appointments_log_event after insert or update on public.appointments
  for each row execute function private.log_appointment_event();

-- ─── Notificaciones (recordatorios) ────────────────────────────────────────

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  kind public.notification_kind not null,
  channel public.notification_channel not null,
  locale public.app_locale not null default 'en',
  scheduled_for timestamptz not null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_jobs_due_idx on public.notification_jobs (scheduled_for) where status = 'pending';
create index notification_jobs_appointment_idx on public.notification_jobs (appointment_id);

-- ─── Pantallas Breeze Live ─────────────────────────────────────────────────

create table public.live_devices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null, -- sesión anónima de la pantalla
  name text not null default 'Breeze Live',
  locale public.app_locale not null default 'en',
  sound_enabled boolean not null default false,
  pairing_code_hash bytea,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index live_devices_salon_idx on public.live_devices (salon_id);
