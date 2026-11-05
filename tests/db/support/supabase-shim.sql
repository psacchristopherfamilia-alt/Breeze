-- ════════════════════════════════════════════════════════════════════════════
-- SOLO PARA TESTS. Imita lo mínimo de Supabase en un Postgres "pelado":
-- roles anon/authenticated/service_role, esquema auth con auth.users y auth.uid().
-- Nunca se aplica en un proyecto de Supabase real (allí ya existe todo esto).
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  phone text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Igual que en Supabase: el "sub" del JWT de la petición.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Igual que en Supabase: privilegios por defecto amplios (las migraciones los recortan).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Sustituto de Supabase Realtime: realtime.send() guarda lo que se habría emitido,
-- para poder comprobar en los tests qué llega a las pantallas.
create schema if not exists realtime;
create table if not exists realtime.test_sent (
  id bigserial primary key,
  payload jsonb not null,
  event text not null,
  topic text not null,
  private boolean not null,
  at timestamptz not null default now()
);
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.test_sent (payload, event, topic, private) values (payload, event, topic, private);
$$;
grant usage on schema realtime to anon, authenticated, service_role;

-- Sustituto mínimo de Supabase Storage: buckets y objetos, para probar las políticas de `storage.objects`.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated, service_role;
