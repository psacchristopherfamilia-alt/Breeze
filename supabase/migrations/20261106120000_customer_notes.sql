-- Ficha del cliente: notas privadas del negocio y lista de clientes con su actividad.
-- Las notas las ve el dueño/administrador de la organización y el profesional que atiende a ese cliente.
-- Nunca las ve el cliente. Solo su autor puede borrarlas; no se editan.

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organization_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  -- Nombre del autor al escribirla: la nota conserva su autor aunque esa persona deje el negocio.
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- El cliente y la nota son de la MISMA organización.
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

-- El autor y su nombre los pone la base de datos, no el navegador.
create or replace function private.customer_notes_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  select coalesce(nullif(btrim(p.full_name), ''), p.email::text, '')
    into new.author_name
    from public.profiles p where p.id = new.author_id;
  new.author_name := coalesce(new.author_name, '');
  new.body := btrim(new.body);
  return new;
end;
$$;
create trigger customer_notes_fill before insert on public.customer_notes
  for each row execute function private.customer_notes_fill();

alter table public.customer_notes enable row level security;
revoke all on public.customer_notes from anon, authenticated;
grant select, insert, delete on public.customer_notes to authenticated;

-- Quién puede ver las notas de un cliente: dueño/admin de la organización, o el profesional que lo atiende.
create policy "nota: dueño/admin y el profesional que lo atiende las ven" on public.customer_notes
  for select to authenticated
  using (
    private.has_org_role(organization_id, '{owner,admin}')
    or exists (
      select 1 from public.appointments a
       where a.customer_id = customer_notes.customer_id
         and a.professional_id in (select private.my_professional_ids())
    )
  );
create policy "nota: las mismas personas las escriben" on public.customer_notes
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, '{owner,admin}')
    or exists (
      select 1 from public.appointments a
       where a.customer_id = customer_notes.customer_id
         and a.professional_id in (select private.my_professional_ids())
    )
  );
create policy "nota: solo su autor la borra" on public.customer_notes
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- Lista de clientes con su actividad. SECURITY INVOKER: la RLS decide qué clientes ve cada persona
-- (dueño/admin, todos los de la organización; profesional, solo los que atiende).
create or replace function public.staff_customers(p_organization_id uuid, p_query text default null, p_limit integer default 100)
returns table (
  customer_id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  visits integer,
  last_visit timestamptz,
  next_visit timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') as txt,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits
  )
  select c.id, c.first_name, c.last_name, c.phone, c.email::text,
         coalesce(v.visits, 0)::integer, v.last_visit, v.next_visit
    from public.customers c
    cross join q
    left join lateral (
      select count(distinct a.booking_group_id) filter (where a.status <> 'cancelled' and a.starts_at <= now()) as visits,
             max(a.starts_at) filter (where a.status <> 'cancelled' and a.starts_at <= now()) as last_visit,
             min(a.starts_at) filter (where a.status = 'booked' and a.starts_at > now()) as next_visit
        from public.appointments a
       where a.customer_id = c.id
    ) v on true
   where c.organization_id = p_organization_id
     and (q.txt = ''
          or (c.first_name || ' ' || c.last_name) ilike '%' || q.txt || '%'
          or (length(q.digits) >= 3 and c.phone like '%' || q.digits || '%'))
   order by coalesce(v.next_visit, v.last_visit) desc nulls last, c.first_name, c.last_name
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
revoke execute on function public.staff_customers(uuid, text, integer) from public, anon;
grant execute on function public.staff_customers(uuid, text, integer) to authenticated;
