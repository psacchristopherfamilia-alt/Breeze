-- ════════════════════════════════════════════════════════════════════════════
-- Fotos: logo y portada del salón, galería, foto de profesional y de servicio.
-- Los archivos viven en Storage (bucket público `salon-media`), en una carpeta por salón:
--   <salon_id>/<tipo>/<archivo>.webp
-- Solo dueño y administradores del salón pueden subir, cambiar o borrar.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Columnas ──────────────────────────────────────────────────────────────
-- Guardan la RUTA dentro del bucket, nunca una URL completa (la URL se arma en la app).
alter table public.salons
  add column logo_path text,
  add column cover_path text,
  add constraint salons_logo_path_check check (logo_path is null or logo_path like id::text || '/%'),
  add constraint salons_cover_path_check check (cover_path is null or cover_path like id::text || '/%');

alter table public.services
  add column photo_path text,
  add constraint services_photo_path_check check (photo_path is null or photo_path like salon_id::text || '/%');

-- professionals.avatar_url ya existía (sin uso): pasa a guardar la ruta de la foto.
alter table public.professionals
  add constraint professionals_avatar_path_check check (avatar_url is null or avatar_url like salon_id::text || '/%');

-- Visitantes: logo y portada son públicos; el resto de columnas no cambia.
grant select (logo_path, cover_path) on public.salons to anon;
-- El panel edita logo y portada con UPDATE directo (el resto de columnas ya tenía su GRANT).
grant update (logo_path, cover_path) on public.salons to authenticated;

-- ─── Galería ───────────────────────────────────────────────────────────────
create table public.salon_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  path text not null unique check (path like salon_id::text || '/%'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index salon_photos_salon_idx on public.salon_photos (salon_id, sort_order);

-- Máximo 9 fotos por salón.
create or replace function private.salon_photos_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.salon_photos where salon_id = new.salon_id) >= 9 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger salon_photos_limit before insert on public.salon_photos
  for each row execute function private.salon_photos_limit();

grant select on public.salon_photos to anon, authenticated;
grant insert, update, delete on public.salon_photos to authenticated;
alter table public.salon_photos enable row level security;

create policy "foto: públicas en salones publicados" on public.salon_photos
  for select to anon, authenticated using (private.is_published_salon(salon_id));
create policy "foto: el personal ve las de su salón" on public.salon_photos
  for select to authenticated using (private.has_salon_role(salon_id, '{owner,admin,professional}'));
create policy "foto: dueño/admin añaden" on public.salon_photos
  for insert to authenticated with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "foto: dueño/admin editan" on public.salon_photos
  for update to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "foto: dueño/admin borran" on public.salon_photos
  for delete to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));

-- ─── Storage ───────────────────────────────────────────────────────────────
-- Bucket público (las fotos del catálogo se ven sin sesión). Solo imágenes, 2 MB como tope:
-- el navegador ya las reduce a ~200 KB antes de subirlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salon-media', 'salon-media', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

-- La primera carpeta de la ruta es el id del salón. Solo dueño/admin de ESE salón escriben ahí.
create or replace function private.can_manage_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.has_salon_role(split_part(p_name, '/', 1)::uuid, '{owner,admin}')
    else false
  end;
$$;
revoke execute on function private.can_manage_media(text) from public, anon;
grant execute on function private.can_manage_media(text) to authenticated;

create policy "salon-media: dueño/admin ven sus archivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'salon-media' and private.can_manage_media(name));
create policy "salon-media: dueño/admin suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'salon-media' and private.can_manage_media(name));
create policy "salon-media: dueño/admin reemplazan" on storage.objects
  for update to authenticated
  using (bucket_id = 'salon-media' and private.can_manage_media(name))
  with check (bucket_id = 'salon-media' and private.can_manage_media(name));
create policy "salon-media: dueño/admin borran" on storage.objects
  for delete to authenticated
  using (bucket_id = 'salon-media' and private.can_manage_media(name));
