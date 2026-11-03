-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 003 · Catálogo: categorías, servicios, profesionales y horarios
-- ════════════════════════════════════════════════════════════════════════════

-- Catálogo fijo de Breeze: categorías por tipo de negocio (PLAN §6.2.1).
create table public.service_categories (
  code text primary key,
  business_type public.business_type not null,
  name_en text not null,
  name_es text not null,
  sort_order integer not null default 0
);

insert into public.service_categories (code, business_type, name_en, name_es, sort_order) values
  ('cuts',            'barbershop', 'Cuts',                'Cortes',                    1),
  ('beard',           'barbershop', 'Beard & shave',       'Barba y afeitado',          2),
  ('designs',         'barbershop', 'Designs & line-ups',  'Diseños y perfilado',       3),
  ('hair_treatments', 'barbershop', 'Hair treatments',     'Tratamientos capilares',    4),
  ('hair',            'salon',      'Hair (cut & style)',  'Cabello (corte y peinado)', 1),
  ('color',           'salon',      'Color',               'Color',                     2),
  ('braids',          'salon',      'Braids & extensions', 'Trenzas y extensiones',     3),
  ('nails',           'salon',      'Nails',               'Uñas',                      4),
  ('makeup',          'salon',      'Makeup',              'Maquillaje',                5),
  ('brows_lashes',    'salon',      'Brows & lashes',      'Cejas y pestañas',          6),
  ('massage',         'spa',        'Massage',             'Masajes',                   1),
  ('facials',         'spa',        'Facials',             'Faciales',                  2),
  ('waxing',          'spa',        'Waxing',              'Depilación',                3),
  ('body',            'spa',        'Body treatments',     'Tratamientos corporales',   4),
  ('packages',        'spa',        'Packages',            'Paquetes',                  5);

-- ─── Servicios ─────────────────────────────────────────────────────────────

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  category_code text not null references public.service_categories (code),
  name_en text not null check (char_length(btrim(name_en)) between 2 and 120),
  name_es text not null check (char_length(btrim(name_es)) between 2 and 120),
  description_en text,
  description_es text,
  duration_min integer not null check (duration_min between 5 and 480),
  buffer_min integer not null default 0 check (buffer_min between 0 and 120),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id)
);
create index services_salon_idx on public.services (salon_id) where is_active;
create trigger services_updated_at before update on public.services
  for each row execute function private.set_updated_at();

-- La categoría del servicio debe pertenecer a uno de los tipos de negocio del salón.
create or replace function private.check_service_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.business_type;
  v_types public.business_type[];
begin
  select business_type into v_type from public.service_categories where code = new.category_code;
  select business_types into v_types from public.salons where id = new.salon_id;
  if not (v_type = any (v_types)) then
    raise exception 'La categoría % (%) no corresponde a los tipos del salón %', new.category_code, v_type, v_types
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger services_check_category before insert or update of category_code, salon_id on public.services
  for each row execute function private.check_service_category();

-- ─── Profesionales ─────────────────────────────────────────────────────────

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  -- Datos públicos derivados: lo único que ve el público y Breeze Live.
  public_name text generated always as (private.short_name(first_name, last_name)) stored,
  initials text generated always as (private.initials(first_name, last_name)) stored,
  color_hex text not null check (color_hex ~ '^#[0-9A-F]{6}$'),
  title public.pro_title not null default 'other',
  bio_en text,
  bio_es text,
  avatar_url text,
  accepts_online boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id)
);
-- Color ÚNICO por sucursal entre los profesionales activos.
create unique index professionals_unique_color_idx on public.professionals (salon_id, color_hex) where is_active;
create index professionals_salon_idx on public.professionals (salon_id);
create trigger professionals_updated_at before update on public.professionals
  for each row execute function private.set_updated_at();

-- Ahora que existe professionals: la membresía de un profesional apunta a su ficha, en su misma sucursal.
alter table public.memberships
  add constraint memberships_professional_fk
  foreign key (professional_id, salon_id) references public.professionals (id, salon_id) on delete cascade;
alter table public.invitations
  add constraint invitations_professional_fk
  foreign key (professional_id, salon_id) references public.professionals (id, salon_id) on delete cascade;

-- Qué servicios ofrece cada profesional (ambos de la MISMA sucursal, garantizado por FK compuesta).
create table public.professional_services (
  professional_id uuid not null,
  service_id uuid not null,
  salon_id uuid not null,
  duration_min_override integer check (duration_min_override between 5 and 480),
  price_cents_override integer check (price_cents_override >= 0),
  primary key (professional_id, service_id),
  foreign key (professional_id, salon_id) references public.professionals (id, salon_id) on delete cascade,
  foreign key (service_id, salon_id) references public.services (id, salon_id) on delete cascade
);
create index professional_services_service_idx on public.professional_services (service_id);

-- ─── Horarios ──────────────────────────────────────────────────────────────

-- Horario semanal en HORA LOCAL del salón. Varias filas por día = horario partido.
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index working_hours_professional_idx on public.working_hours (professional_id, weekday);

-- Días u horas libres (en UTC).
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_professional_idx on public.time_off (professional_id, starts_at);

-- Cierres de la sucursal (festivos, huracán…).
create table public.salon_closures (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason_en text,
  reason_es text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index salon_closures_salon_idx on public.salon_closures (salon_id, starts_at);
