-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 002 · Planes, perfiles, organizaciones, sucursales, membresías, facturación
-- ════════════════════════════════════════════════════════════════════════════

-- Planes: los precios viven aquí (no en el código) para poder cambiarlos sin desplegar.
create table public.plans (
  code text primary key,
  name text not null,
  min_pros integer not null check (min_pros >= 1),
  max_pros integer check (max_pros is null or max_pros >= min_pros),
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  annual_price_cents integer not null check (annual_price_cents >= 0),
  extra_branch_price_cents integer not null check (extra_branch_price_cents >= 0),
  message_quota integer not null default 0 check (message_quota >= 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.plans
  (code, name, min_pros, max_pros, monthly_price_cents, annual_price_cents, extra_branch_price_cents, message_quota, features, sort_order)
values
  ('solo',   'Solo',   1, 2,    2900, 29000, 3900,    0, '{"live": false, "whatsapp": false}', 1),
  ('studio', 'Studio', 3, 6,    5900, 59000, 3900,  300, '{"live": true,  "whatsapp": true}',  2),
  ('salon',  'Salon',  7, null, 9900, 99000, 3900, 1000, '{"live": true,  "whatsapp": true, "reports": true}', 3);

-- Perfil 1:1 con auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email extensions.citext,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  locale public.app_locale not null default 'en',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Organización = el negocio del dueño (puede tener varias sucursales).
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

-- Sucursal (lo que el cliente ve como "salón").
create table public.salons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_types public.business_type[] not null check (cardinality(business_types) >= 1),
  zone public.salon_zone not null,
  address text,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  timezone text not null default 'America/Grand_Turk',
  currency char(3) not null default 'USD',
  slot_step_min integer not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_lead_time_min integer not null default 60 check (min_lead_time_min between 0 and 10080),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 365),
  cancellation_window_hours integer not null default 24 check (cancellation_window_hours between 0 and 168),
  no_show_block_enabled boolean not null default false,
  no_show_threshold integer not null default 2 check (no_show_threshold >= 1),
  reminder_offsets_min integer[] not null default '{1440,120}',
  is_published boolean not null default false,
  search tsvector generated always as (to_tsvector('simple', coalesce(name, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index salons_organization_idx on public.salons (organization_id);
create index salons_search_idx on public.salons using gin (search);
create index salons_published_zone_idx on public.salons (zone) where is_published;
create trigger salons_updated_at before update on public.salons
  for each row execute function private.set_updated_at();

-- Membresías: ÚNICA fuente de permisos del personal.
--   owner        → toda la organización
--   admin        → una sucursal (salon_id) o todas (salon_id null)
--   professional → su propia agenda (professional_id)
--   display      → pantalla Breeze Live de una sucursal
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  salon_id uuid,
  professional_id uuid, -- FK añadida en 003 (professionals aún no existe)
  role public.member_role not null,
  created_at timestamptz not null default now(),
  foreign key (salon_id, organization_id) references public.salons (id, organization_id) on delete cascade,
  constraint memberships_scope check (
    (role = 'owner'        and salon_id is null     and professional_id is null) or
    (role = 'admin'        and professional_id is null) or
    (role = 'professional' and salon_id is not null and professional_id is not null) or
    (role = 'display'      and salon_id is not null and professional_id is null)
  )
);
create unique index memberships_unique_idx on public.memberships
  (user_id, organization_id, role, coalesce(salon_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index memberships_one_account_per_professional_idx on public.memberships (professional_id)
  where professional_id is not null;
create index memberships_user_idx on public.memberships (user_id);
create index memberships_salon_idx on public.memberships (salon_id);

-- Invitaciones para admins y profesionales.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  salon_id uuid,
  professional_id uuid,
  role public.member_role not null check (role in ('admin', 'professional')),
  email extensions.citext,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  token_hash bytea not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (salon_id, organization_id) references public.salons (id, organization_id) on delete cascade,
  check (email is not null or phone is not null),
  check (role <> 'professional' or (salon_id is not null and professional_id is not null))
);

-- ─── Facturación manual ────────────────────────────────────────────────────

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status public.subscription_status not null default 'trialing',
  billing_cycle public.billing_cycle not null default 'monthly',
  extra_branches integer not null default 0 check (extra_branches >= 0),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null unique,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  amount_cents integer not null check (amount_cents >= 0),
  status public.invoice_status not null default 'open',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index invoices_organization_idx on public.invoices (organization_id, due_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  organization_id uuid not null,
  method public.payment_method not null,
  amount_cents integer not null check (amount_cents > 0),
  reference text,
  received_at timestamptz not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, organization_id) references public.invoices (id, organization_id) on delete cascade
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  organization_id uuid references public.organizations (id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  at timestamptz not null default now()
);
create index audit_log_organization_idx on public.audit_log (organization_id, at desc);
