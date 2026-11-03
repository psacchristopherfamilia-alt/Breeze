-- ════════════════════════════════════════════════════════════════════════════
-- Datos de prueba: 2 organizaciones aisladas.
--   Org A "Coral Group": sucursales A1 (Grace Bay) y A2 (Leeward)
--   Org B "Front Street": sucursal B1 (Grand Turk)
-- UUIDs legibles: 1xx usuarios, 2xx orgs, 3xx salones, 4xx profesionales, 5xx servicios, 6xx clientes
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'owner.a@example.com'),
  ('00000000-0000-4000-8000-000000000102', 'admin.a2@example.com'),
  ('00000000-0000-4000-8000-000000000103', 'carlos@example.com'),
  ('00000000-0000-4000-8000-000000000104', 'tv.a1@example.com'),
  ('00000000-0000-4000-8000-000000000105', 'owner.b@example.com'),
  ('00000000-0000-4000-8000-000000000106', 'juan@example.com'),
  ('00000000-0000-4000-8000-000000000107', 'stranger@example.com');

-- El trigger on_auth_user_created ya creó los perfiles; solo les damos nombre.
update public.profiles set full_name = split_part(email, '@', 1);

insert into public.organizations (id, name, slug, owner_id) values
  ('00000000-0000-4000-8000-000000000201', 'Coral Group', 'coral-group', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202', 'Front Street', 'front-street', '00000000-0000-4000-8000-000000000105');

insert into public.salons (id, organization_id, name, slug, business_types, zone, is_published) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'Coral Barber', 'coral-barber', '{barbershop}', 'grace_bay', true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 'Coral Nails', 'coral-nails', '{salon}', 'leeward', true),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000202', 'Front Street Cuts', 'front-street-cuts', '{barbershop}', 'grand_turk', true);

insert into public.professionals (id, salon_id, first_name, last_name, color_hex, title) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', 'Carlos', 'Martínez', '#2563EB', 'barber'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000301', 'Andre', 'Williams', '#DC2626', 'barber'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000302', 'María', 'Rodríguez', '#BE185D', 'nail_tech'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000303', 'Marcus', 'Robinson', '#4F46E5', 'barber');

insert into public.services (id, salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000301', 'cuts', 'Classic cut', 'Corte clásico', 30, 10, 2500),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000302', 'nails', 'Manicure', 'Manicura', 45, 10, 3500),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000303', 'cuts', 'Haircut', 'Corte de pelo', 30, 10, 2200);

insert into public.professional_services (professional_id, service_id, salon_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000301'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000301'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000302'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000303');

insert into public.working_hours (professional_id, weekday, start_time, end_time) values
  ('00000000-0000-4000-8000-000000000401', 2, '09:00', '18:00'),
  ('00000000-0000-4000-8000-000000000404', 2, '09:00', '18:00');

insert into public.memberships (user_id, organization_id, salon_id, professional_id, role) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', null, null, 'owner'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000302', null, 'admin'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000401', 'professional'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', null, 'display'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000202', null, null, 'owner');

-- Juan es cliente de las DOS organizaciones (una ficha en cada una). Ashley es invitada en A.
insert into public.customers (id, organization_id, user_id, first_name, last_name, phone, email) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000106', 'Juan', 'Pérez', '+16492314455', 'juan@example.com'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000106', 'Juan', 'Pérez', '+16492314455', 'juan@example.com'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000201', null, 'Ashley', 'Taylor', '+16495550001', null);
