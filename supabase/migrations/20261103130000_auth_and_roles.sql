-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 006 · Autenticación y roles
--   · Perfil automático al registrarse (correo + teléfono)
--   · Alta de salón: organización + dueño + 1.ª sucursal + prueba de 14 días
--   · Sucursales adicionales
--   · Invitaciones a admins y profesionales (token de un solo uso, se guarda solo el hash)
--   · Contexto del usuario (qué organizaciones/sucursales/roles tiene)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Utilidades ────────────────────────────────────────────────────────────

-- Teléfono a E.164 ("+16495551234"). Devuelve null si no es válido (nunca rompe un registro).
-- Turks and Caicos usa el plan norteamericano (+1, prefijo 649):
--   "+44 20 …"        → se respeta (ya trae país)
--   "1 649 555 1234"  → +16495551234
--   "649 555 1234"    → +16495551234 (10 dígitos: falta el +1)
--   "555 1234"        → +16495551234 (7 dígitos: número local de TCI)
create or replace function private.normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  v_e164 text;
begin
  if v_digits = '' then
    return null;
  end if;
  v_e164 := case
    when btrim(p) like '+%'                         then '+' || v_digits
    when length(v_digits) = 11 and v_digits like '1%' then '+' || v_digits
    when length(v_digits) = 10                       then '+1' || v_digits
    when length(v_digits) = 7                        then '+1649' || v_digits
    else '+' || v_digits
  end;
  return case when v_e164 ~ '^\+[1-9][0-9]{6,14}$' then v_e164 else null end;
end;
$$;

-- "Coral Salón & Nails" → "coral-salon-nails"
create or replace function private.slugify(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        translate(lower(btrim(p)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
        '[^a-z0-9]+', '-', 'g'),
      '-'),
    '');
$$;

-- Slug libre en una tabla: "coral-group", "coral-group-2", "coral-group-3"…
create or replace function private.unique_slug(p_base text, p_table text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := coalesce(private.slugify(p_base), 'breeze');
  v_slug text := v_base;
  v_n integer := 1;
  v_exists boolean;
begin
  loop
    execute format('select exists (select 1 from public.%I where slug = $1)', p_table) into v_exists using v_slug;
    exit when not v_exists;
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- ─── Perfil automático ─────────────────────────────────────────────────────
-- Se crea al registrarse. Los datos vienen de auth.users y de options.data del signUp:
--   { full_name, phone, locale }
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_locale text := v_meta ->> 'locale';
begin
  insert into public.profiles (id, full_name, email, phone, locale)
  values (
    new.id,
    coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), ''),
    nullif(new.email, ''),
    private.normalize_phone(coalesce(v_meta ->> 'phone', new.phone)),
    case when v_locale in ('en', 'es') then v_locale::public.app_locale else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Mantiene el correo del perfil sincronizado si el usuario lo cambia.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = nullif(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ─── Alta de salón ─────────────────────────────────────────────────────────

create or replace function public.create_organization(
  p_org_name text,
  p_salon_name text,
  p_business_types public.business_type[],
  p_zone public.salon_zone,
  p_phone text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organizations;
  v_salon public.salons;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug, owner_id)
  values (btrim(p_org_name), private.unique_slug(p_org_name, 'organizations'), v_user)
  returning * into v_org;

  insert into public.memberships (user_id, organization_id, role)
  values (v_user, v_org.id, 'owner');

  insert into public.salons (organization_id, name, slug, business_types, zone, phone, address)
  values (v_org.id, btrim(p_salon_name), private.unique_slug(p_salon_name, 'salons'),
          p_business_types, p_zone, private.normalize_phone(p_phone), nullif(btrim(p_address), ''))
  returning * into v_salon;

  -- 14 días de prueba con todo incluido (plan Studio).
  insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at, current_period_end)
  values (v_org.id, 'studio', 'trialing', now() + interval '14 days', now() + interval '14 days');

  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id)
  values (v_user, v_org.id, 'organization.created', 'organizations', v_org.id);

  return jsonb_build_object(
    'organization_id', v_org.id, 'organization_slug', v_org.slug,
    'salon_id', v_salon.id, 'salon_slug', v_salon.slug
  );
end;
$$;

-- Sucursal adicional (solo el dueño).
create or replace function public.create_branch(
  p_organization_id uuid,
  p_salon_name text,
  p_business_types public.business_type[],
  p_zone public.salon_zone,
  p_phone text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
begin
  if not private.has_org_role(p_organization_id, '{owner}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.salons (organization_id, name, slug, business_types, zone, phone, address)
  values (p_organization_id, btrim(p_salon_name), private.unique_slug(p_salon_name, 'salons'),
          p_business_types, p_zone, private.normalize_phone(p_phone), nullif(btrim(p_address), ''))
  returning * into v_salon;

  update public.subscriptions
     set extra_branches = (select count(*) - 1 from public.salons where organization_id = p_organization_id)
   where organization_id = p_organization_id;

  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id)
  values (auth.uid(), p_organization_id, 'salon.created', 'salons', v_salon.id);

  return jsonb_build_object('salon_id', v_salon.id, 'salon_slug', v_salon.slug);
end;
$$;

-- ─── Invitaciones ──────────────────────────────────────────────────────────

-- Devuelve el token EN CLARO una sola vez (para el enlace /invite/[token]); en la BD solo queda su sha256.
create or replace function public.create_invitation(
  p_organization_id uuid,
  p_role public.member_role,
  p_salon_id uuid default null,
  p_professional_id uuid default null,
  p_email text default null,
  p_phone text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_phone text := private.normalize_phone(p_phone);
begin
  if p_role not in ('admin', 'professional') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  -- Dueño: puede invitar admins y profesionales. Admin de la sucursal: solo profesionales de esa sucursal.
  if not (
    private.has_org_role(p_organization_id, '{owner}')
    or (p_role = 'professional' and p_salon_id is not null and private.has_salon_role(p_salon_id, '{admin}'))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'email_or_phone_required' using errcode = '22023';
  end if;
  if p_role = 'professional' then
    if p_professional_id is null or p_salon_id is null then
      raise exception 'professional_required' using errcode = '22023';
    end if;
    if exists (select 1 from public.memberships where professional_id = p_professional_id) then
      raise exception 'professional_already_linked' using errcode = '23505';
    end if;
  end if;

  insert into public.invitations
    (organization_id, salon_id, professional_id, role, email, phone, token_hash, invited_by)
  values
    (p_organization_id, p_salon_id, p_professional_id, p_role, v_email, v_phone,
     sha256(convert_to(v_token, 'UTF8')), auth.uid());

  return v_token;
end;
$$;

-- Acepta una invitación con la cuenta actual. El correo o teléfono de la cuenta debe coincidir.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.invitations;
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations
   where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
   for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not (
    (v_inv.email is not null and v_profile.email = v_inv.email)
    or (v_inv.phone is not null and v_profile.phone = v_inv.phone)
  ) then
    raise exception 'invitation_wrong_account' using errcode = '42501';
  end if;

  insert into public.memberships (user_id, organization_id, salon_id, professional_id, role)
  values (v_user, v_inv.organization_id, v_inv.salon_id, v_inv.professional_id, v_inv.role)
  on conflict do nothing;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (v_user, v_inv.organization_id, 'invitation.accepted', 'invitations', v_inv.id,
          jsonb_build_object('role', v_inv.role, 'salon_id', v_inv.salon_id));

  return jsonb_build_object('organization_id', v_inv.organization_id, 'salon_id', v_inv.salon_id, 'role', v_inv.role);
end;
$$;

-- ─── Contexto del usuario ──────────────────────────────────────────────────
-- Una fila por (sucursal, rol). El dueño/admin de toda la organización recibe una fila por cada sucursal.
create or replace function public.my_context()
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  salon_id uuid,
  salon_name text,
  salon_slug text,
  role public.member_role,
  professional_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.slug, s.id, s.name, s.slug, m.role, m.professional_id
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    join public.salons s on s.organization_id = o.id and (m.salon_id is null or s.id = m.salon_id)
   where m.user_id = (select auth.uid())
   order by o.name, s.name, m.role;
$$;

-- ─── Permisos de ejecución ─────────────────────────────────────────────────
revoke execute on function public.create_organization(text, text, public.business_type[], public.salon_zone, text, text) from public, anon;
revoke execute on function public.create_branch(uuid, text, public.business_type[], public.salon_zone, text, text) from public, anon;
revoke execute on function public.create_invitation(uuid, public.member_role, uuid, uuid, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.my_context() from public, anon;

grant execute on function public.create_organization(text, text, public.business_type[], public.salon_zone, text, text) to authenticated;
grant execute on function public.create_branch(uuid, text, public.business_type[], public.salon_zone, text, text) to authenticated;
grant execute on function public.create_invitation(uuid, public.member_role, uuid, uuid, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.my_context() to authenticated;
