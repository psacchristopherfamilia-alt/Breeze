-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 005 · Seguridad: helpers, permisos (GRANT) y Row Level Security
-- ════════════════════════════════════════════════════════════════════════════
-- Principio: un salón JAMÁS ve datos de otro. Todo se decide con la tabla memberships.
-- Las citas NO se escriben directamente: solo mediante funciones RPC (módulo 3).
-- La clave service_role (servidor / Edge Functions) se salta RLS por diseño de Supabase.

-- ─── Helpers (security definer: leen memberships sin pasar por RLS, evitan recursión) ───

create or replace function private.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid())
       and m.organization_id = p_org
       and m.role = any (p_roles)
  );
$$;

-- true si el usuario tiene el rol en ESA sucursal, o a nivel de toda la organización (salon_id nulo).
create or replace function private.has_salon_role(p_salon uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.salons s on s.organization_id = m.organization_id
     where s.id = p_salon
       and m.user_id = (select auth.uid())
       and m.role = any (p_roles)
       and (m.salon_id is null or m.salon_id = p_salon)
  );
$$;

create or replace function private.my_professional_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.professional_id from public.memberships m
   where m.user_id = (select auth.uid()) and m.role = 'professional';
$$;

create or replace function private.my_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c where c.user_id = (select auth.uid());
$$;

create or replace function private.is_published_salon(p_salon uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.is_published from public.salons s where s.id = p_salon), false);
$$;

create or replace function private.salon_of_professional(p_professional uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.salon_id from public.professionals p where p.id = p_professional;
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ─── Permisos por tabla (GRANT). RLS decide además QUÉ filas. ───────────────
-- Partimos de cero: Supabase concede ALL por defecto a anon/authenticated.
revoke all on all tables in schema public from anon, authenticated;

-- Catálogo público (también para visitantes sin cuenta).
grant select on public.plans, public.service_categories, public.salons, public.services,
  public.professional_services to anon, authenticated;
-- Visitantes: SOLO columnas públicas de los profesionales (nunca apellido completo).
grant select (id, salon_id, public_name, initials, color_hex, title, bio_en, bio_es, avatar_url,
  accepts_online, is_active, sort_order) on public.professionals to anon;
grant select on public.professionals to authenticated;

-- Usuarios con sesión.
grant select on public.profiles to authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated; -- nunca is_platform_admin
grant select, insert, update on public.organizations to authenticated;
grant insert, update on public.salons to authenticated;
grant select, insert, update, delete on public.memberships, public.invitations, public.working_hours,
  public.time_off, public.salon_closures, public.live_devices to authenticated;
grant insert, update, delete on public.services, public.professional_services to authenticated;
grant insert, update on public.professionals to authenticated;
grant select, insert, update on public.customers to authenticated;
-- Solo lectura: se escriben vía RPC / servidor.
grant select on public.booking_groups, public.appointments, public.appointment_events,
  public.notification_jobs, public.subscriptions, public.invoices, public.payments,
  public.audit_log to authenticated;

-- ─── Activar RLS en TODAS las tablas ───────────────────────────────────────
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.salons enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.salon_closures enable row level security;
alter table public.customers enable row level security;
alter table public.booking_groups enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.live_devices enable row level security;

-- ─── Catálogo de referencia ────────────────────────────────────────────────
create policy "plans: lectura pública" on public.plans
  for select to anon, authenticated using (is_active);
create policy "categorías: lectura pública" on public.service_categories
  for select to anon, authenticated using (true);

-- ─── Perfiles ──────────────────────────────────────────────────────────────
create policy "perfil: ver el propio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar el propio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── Organizaciones ────────────────────────────────────────────────────────
create policy "org: miembros la ven" on public.organizations
  for select to authenticated
  using (private.has_org_role(id, '{owner,admin,professional,display}'));
create policy "org: crear como dueño" on public.organizations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "org: el dueño la edita" on public.organizations
  for update to authenticated
  using (private.has_org_role(id, '{owner}')) with check (private.has_org_role(id, '{owner}'));

-- ─── Sucursales ────────────────────────────────────────────────────────────
create policy "salón: publicados son públicos" on public.salons
  for select to anon, authenticated using (is_published);
create policy "salón: el personal ve los suyos" on public.salons
  for select to authenticated
  using (private.has_salon_role(id, '{owner,admin,professional,display}'));
create policy "salón: el dueño crea sucursales" on public.salons
  for insert to authenticated with check (private.has_org_role(organization_id, '{owner}'));
create policy "salón: dueño/admin editan" on public.salons
  for update to authenticated
  using (private.has_salon_role(id, '{owner,admin}'))
  with check (private.has_salon_role(id, '{owner,admin}'));

-- ─── Membresías e invitaciones ─────────────────────────────────────────────
create policy "membresía: ver las propias o gestionarlas" on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_org_role(organization_id, '{owner,admin}'));
-- Dueño: todo. Admin: solo profesionales y pantallas de SU sucursal.
create policy "membresía: crear" on public.memberships
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, '{owner}')
    or (role in ('professional', 'display') and private.has_salon_role(salon_id, '{admin}'))
  );
create policy "membresía: editar" on public.memberships
  for update to authenticated
  using (
    private.has_org_role(organization_id, '{owner}')
    or (role in ('professional', 'display') and private.has_salon_role(salon_id, '{admin}'))
  )
  with check (
    private.has_org_role(organization_id, '{owner}')
    or (role in ('professional', 'display') and private.has_salon_role(salon_id, '{admin}'))
  );
create policy "membresía: borrar" on public.memberships
  for delete to authenticated
  using (
    private.has_org_role(organization_id, '{owner}')
    or (role in ('professional', 'display') and private.has_salon_role(salon_id, '{admin}'))
  );

create policy "invitación: dueño/admin gestionan" on public.invitations
  for all to authenticated
  using (
    private.has_org_role(organization_id, '{owner}')
    or (role = 'professional' and private.has_salon_role(salon_id, '{admin}'))
  )
  with check (
    private.has_org_role(organization_id, '{owner}')
    or (role = 'professional' and private.has_salon_role(salon_id, '{admin}'))
  );

-- ─── Servicios y profesionales ─────────────────────────────────────────────
create policy "servicio: activos de salones publicados son públicos" on public.services
  for select to anon, authenticated
  using (is_active and private.is_published_salon(salon_id));
create policy "servicio: el personal ve los de su salón" on public.services
  for select to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin,professional,display}'));
create policy "servicio: dueño/admin crean" on public.services
  for insert to authenticated with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "servicio: dueño/admin editan" on public.services
  for update to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "servicio: dueño/admin borran" on public.services
  for delete to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));

create policy "profesional: activos de salones publicados son públicos" on public.professionals
  for select to anon, authenticated
  using (is_active and private.is_published_salon(salon_id));
create policy "profesional: el personal ve los de su salón" on public.professionals
  for select to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin,professional,display}'));
create policy "profesional: dueño/admin crean" on public.professionals
  for insert to authenticated with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "profesional: dueño/admin editan" on public.professionals
  for update to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));

create policy "profesional-servicio: público en salones publicados" on public.professional_services
  for select to anon, authenticated using (private.is_published_salon(salon_id));
create policy "profesional-servicio: el personal lo ve" on public.professional_services
  for select to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin,professional,display}'));
create policy "profesional-servicio: dueño/admin crean" on public.professional_services
  for insert to authenticated with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "profesional-servicio: dueño/admin editan" on public.professional_services
  for update to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "profesional-servicio: dueño/admin borran" on public.professional_services
  for delete to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));

-- ─── Horarios (privados: el público usa get_busy_ranges en el módulo 3) ──────
create policy "horario: el personal lo ve" on public.working_hours
  for select to authenticated
  using (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin,professional}'));
create policy "horario: dueño/admin gestionan" on public.working_hours
  for all to authenticated
  using (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin}'))
  with check (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin}'));

create policy "libre: el personal lo ve" on public.time_off
  for select to authenticated
  using (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin,professional}'));
create policy "libre: dueño/admin gestionan" on public.time_off
  for all to authenticated
  using (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin}'))
  with check (private.has_salon_role(private.salon_of_professional(professional_id), '{owner,admin}'));

create policy "cierre: el personal lo ve" on public.salon_closures
  for select to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin,professional}'));
create policy "cierre: dueño/admin gestionan" on public.salon_closures
  for all to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));

-- ─── Clientes ──────────────────────────────────────────────────────────────
create policy "cliente: ver la ficha propia" on public.customers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cliente: dueño/admin ven los de su organización" on public.customers
  for select to authenticated using (private.has_org_role(organization_id, '{owner,admin}'));
create policy "cliente: el profesional ve a quien atiende" on public.customers
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
     where a.customer_id = customers.id
       and a.professional_id in (select private.my_professional_ids())
  ));
create policy "cliente: dueño/admin crean" on public.customers
  for insert to authenticated with check (private.has_org_role(organization_id, '{owner,admin}'));
create policy "cliente: dueño/admin editan" on public.customers
  for update to authenticated
  using (private.has_org_role(organization_id, '{owner,admin}'))
  with check (private.has_org_role(organization_id, '{owner,admin}'));

-- ─── Reservas y citas (solo lectura; se escriben por RPC) ──────────────────
create policy "reserva: el cliente ve las suyas" on public.booking_groups
  for select to authenticated using (customer_id in (select private.my_customer_ids()));
create policy "reserva: dueño/admin ven las de su salón" on public.booking_groups
  for select to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "reserva: el profesional ve las suyas" on public.booking_groups
  for select to authenticated
  using (exists (
    select 1 from public.appointments a
     where a.booking_group_id = booking_groups.id
       and a.professional_id in (select private.my_professional_ids())
  ));

create policy "cita: el cliente ve las suyas" on public.appointments
  for select to authenticated using (customer_id in (select private.my_customer_ids()));
create policy "cita: dueño/admin ven las de su salón" on public.appointments
  for select to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "cita: el profesional ve SOLO su agenda" on public.appointments
  for select to authenticated using (professional_id in (select private.my_professional_ids()));

create policy "historial: visible si la cita es visible" on public.appointment_events
  for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_events.appointment_id));

create policy "notificación: dueño/admin las ven" on public.notification_jobs
  for select to authenticated using (private.has_salon_role(salon_id, '{owner,admin}'));

-- ─── Pantallas Breeze Live ─────────────────────────────────────────────────
create policy "pantalla: dueño/admin gestionan" on public.live_devices
  for all to authenticated
  using (private.has_salon_role(salon_id, '{owner,admin}'))
  with check (private.has_salon_role(salon_id, '{owner,admin}'));
create policy "pantalla: el dispositivo se ve a sí mismo" on public.live_devices
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Facturación (solo el dueño; la escribe el admin de plataforma desde el servidor) ───
create policy "suscripción: el dueño la ve" on public.subscriptions
  for select to authenticated using (private.has_org_role(organization_id, '{owner}'));
create policy "factura: el dueño las ve" on public.invoices
  for select to authenticated using (private.has_org_role(organization_id, '{owner}'));
create policy "pago: el dueño los ve" on public.payments
  for select to authenticated using (private.has_org_role(organization_id, '{owner}'));
create policy "auditoría: el dueño la ve" on public.audit_log
  for select to authenticated using (private.has_org_role(organization_id, '{owner}'));
