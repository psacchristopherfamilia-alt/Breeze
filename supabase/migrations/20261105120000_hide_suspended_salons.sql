-- Un negocio suspendido (sin pago, ver private.org_can_book) deja de aparecer en el catálogo público.
-- No se borra nada: el panel y la agenda del negocio siguen funcionando.
create or replace function private.is_published_salon(p_salon uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.is_published and private.org_can_book(s.organization_id)
      from public.salons s where s.id = p_salon
  ), false);
$$;

drop policy "salón: publicados son públicos" on public.salons;
create policy "salón: publicados son públicos" on public.salons
  for select to anon, authenticated
  using (is_published and private.org_can_book(organization_id));
