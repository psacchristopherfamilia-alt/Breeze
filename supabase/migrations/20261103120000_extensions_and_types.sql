-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 001 · Extensiones, esquemas y tipos
-- ════════════════════════════════════════════════════════════════════════════
-- btree_gist: permite combinar "=" (uuid) y "&&" (rangos) en una exclusion constraint,
-- que es la que hace IMPOSIBLE la doble reserva a nivel de base de datos.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

-- Funciones internas (helpers de RLS, triggers). No se expone por la API de Supabase.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type public.app_locale as enum ('en', 'es');
create type public.business_type as enum ('barbershop', 'salon', 'spa');
create type public.salon_zone as enum (
  'grace_bay', 'downtown_provo', 'leeward', 'long_bay', 'turtle_cove', 'the_bight',
  'chalk_sound', 'five_cays', 'blue_hills', 'kew_town', 'grand_turk',
  'north_caicos', 'middle_caicos', 'south_caicos', 'salt_cay'
);
create type public.member_role as enum ('owner', 'admin', 'professional', 'display');
create type public.pro_title as enum (
  'barber', 'stylist', 'nail_tech', 'makeup_artist', 'esthetician', 'massage_therapist', 'other'
);
create type public.appointment_status as enum ('booked', 'completed', 'cancelled', 'no_show');
create type public.booking_source as enum ('online', 'phone', 'walk_in');
create type public.appointment_event_type as enum (
  'created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'status_changed'
);
create type public.notification_kind as enum ('confirmation', 'reminder', 'cancellation', 'reschedule');
create type public.notification_channel as enum ('whatsapp', 'sms', 'email');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'cancelled');
create type public.billing_cycle as enum ('monthly', 'annual');
create type public.invoice_status as enum ('open', 'paid', 'void');
create type public.payment_method as enum ('bank_transfer', 'cash', 'other');

-- ─── Utilidades ────────────────────────────────────────────────────────────

-- Mantiene updated_at al día.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Juan Pérez" → "Juan P.". Único formato permitido en pantallas públicas.
create or replace function private.short_name(first_name text, last_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select split_part(btrim(first_name), ' ', 1)
         || case when btrim(coalesce(last_name, '')) = '' then ''
                 else ' ' || upper(left(btrim(last_name), 1)) || '.' end;
$$;

-- "Carlos Martínez" → "CM"
create or replace function private.initials(first_name text, last_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(left(btrim(first_name), 1) || left(btrim(coalesce(last_name, '')), 1));
$$;
