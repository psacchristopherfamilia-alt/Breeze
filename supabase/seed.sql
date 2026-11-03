-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · datos de DEMOSTRACIÓN (supabase db reset). Nada de esto es real.
--   Cuenta del dueño de demo:  owner@breeze.demo  /  breeze-demo-2026
--   Org "Coral Group":  Coral Salon & Nails (Grace Bay) + Seabreeze Spa (Leeward)
--   Org "Island Fade":  Island Fade Barbershop (Downtown Provo)
-- ════════════════════════════════════════════════════════════════════════════

-- Usuario dueño de demo. En Supabase real, auth.users tiene más columnas (contraseña, confirmación…):
-- se rellenan solo si existen, para que este seed también sirva en el Postgres de los tests.
do $$
declare
  v_id uuid := '10000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    execute $q$
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@breeze.demo',
              extensions.crypt('breeze-demo-2026', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Owner","phone":"+16490000001","locale":"en"}',
              now(), now())
      on conflict (id) do nothing $q$ using v_id;
    execute $q$
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
      values (gen_random_uuid(), $1, $1::text, 'email',
              jsonb_build_object('sub', $1::text, 'email', 'owner@breeze.demo', 'email_verified', true), now(), now(), now())
      on conflict do nothing $q$ using v_id;
  else
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_id, 'owner@breeze.demo', '{"full_name":"Demo Owner","phone":"+16490000001","locale":"en"}')
    on conflict (id) do nothing;
  end if;
end $$;

insert into public.organizations (id, name, slug, owner_id) values
  ('20000000-0000-4000-8000-000000000001', 'Coral Group', 'coral-group', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Island Fade', 'island-fade', '10000000-0000-4000-8000-000000000001');

insert into public.memberships (user_id, organization_id, role) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'owner');

insert into public.subscriptions (organization_id, plan_code, status, trial_ends_at, current_period_end) values
  ('20000000-0000-4000-8000-000000000001', 'studio', 'trialing', now() + interval '14 days', now() + interval '14 days'),
  ('20000000-0000-4000-8000-000000000002', 'studio', 'active', null, now() + interval '30 days');

insert into public.salons (id, organization_id, name, slug, business_types, zone, address, phone, cancellation_window_hours, min_lead_time_min, is_published) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Coral Salon & Nails', 'coral-salon', '{salon}', 'grace_bay', 'Grace Bay Rd, Providenciales', '+16490000202', 24, 60, true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Seabreeze Spa & Esthetics', 'seabreeze-spa', '{spa}', 'leeward', 'Leeward Marina, Providenciales', '+16490000303', 48, 120, true),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Island Fade Barbershop', 'island-fade', '{barbershop}', 'downtown_provo', 'Leeward Hwy, Downtown Providenciales', '+16490000101', 24, 60, true);

insert into public.services (id, salon_id, category_code, name_en, name_es, duration_min, buffer_min, price_cents, sort_order) values
  -- Coral Salon
  ('50000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000001', 'hair',   'Cut & blow-dry', 'Corte y secado', 60, 10, 6500, 1),
  ('50000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000001', 'color',  'Full color', 'Tinte completo', 120, 15, 14000, 2),
  ('50000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000001', 'nails',  'Manicure', 'Manicura', 45, 10, 3500, 3),
  ('50000000-0000-4000-8000-000000000204', '30000000-0000-4000-8000-000000000001', 'nails',  'Pedicure', 'Pedicura', 60, 10, 5000, 4),
  ('50000000-0000-4000-8000-000000000205', '30000000-0000-4000-8000-000000000001', 'makeup', 'Event makeup', 'Maquillaje de evento', 60, 10, 9000, 5),
  -- Seabreeze Spa
  ('50000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000002', 'massage', 'Relaxing massage (60 min)', 'Masaje relajante (60 min)', 60, 15, 12000, 1),
  ('50000000-0000-4000-8000-000000000302', '30000000-0000-4000-8000-000000000002', 'facials', 'Deep cleansing facial', 'Facial de limpieza profunda', 60, 10, 11000, 2),
  ('50000000-0000-4000-8000-000000000303', '30000000-0000-4000-8000-000000000002', 'waxing',  'Full leg wax', 'Depilación de piernas', 45, 10, 6500, 3),
  -- Island Fade
  ('50000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000003', 'cuts',  'Classic cut', 'Corte clásico', 30, 10, 2500, 1),
  ('50000000-0000-4000-8000-000000000102', '30000000-0000-4000-8000-000000000003', 'cuts',  'Skin fade', 'Degradado (fade)', 45, 10, 3500, 2),
  ('50000000-0000-4000-8000-000000000103', '30000000-0000-4000-8000-000000000003', 'beard', 'Beard trim & line-up', 'Arreglo de barba', 20, 5, 1500, 3);

insert into public.professionals (id, salon_id, first_name, last_name, color_hex, title, sort_order) values
  ('40000000-0000-4000-8000-000000000201', '30000000-0000-4000-8000-000000000001', 'María', 'Rodríguez', '#BE185D', 'stylist', 1),
  ('40000000-0000-4000-8000-000000000202', '30000000-0000-4000-8000-000000000001', 'Keisha', 'Forbes', '#7C3AED', 'nail_tech', 2),
  ('40000000-0000-4000-8000-000000000203', '30000000-0000-4000-8000-000000000001', 'Daniela', 'Pérez', '#B45309', 'makeup_artist', 3),
  ('40000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000002', 'Ana', 'Silva', '#047857', 'massage_therapist', 1),
  ('40000000-0000-4000-8000-000000000302', '30000000-0000-4000-8000-000000000002', 'Natalie', 'Gardiner', '#4F46E5', 'esthetician', 2),
  ('40000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000003', 'Carlos', 'Martínez', '#2563EB', 'barber', 1),
  ('40000000-0000-4000-8000-000000000102', '30000000-0000-4000-8000-000000000003', 'Andre', 'Williams', '#DC2626', 'barber', 2),
  ('40000000-0000-4000-8000-000000000103', '30000000-0000-4000-8000-000000000003', 'Luis', 'Gómez', '#15803D', 'barber', 3);

insert into public.professional_services (professional_id, service_id, salon_id)
select p.id, s.id, p.salon_id
  from public.professionals p join public.services s on s.salon_id = p.salon_id
 where (p.title, s.category_code) in (
   ('stylist', 'hair'), ('stylist', 'color'), ('nail_tech', 'nails'), ('makeup_artist', 'makeup'), ('makeup_artist', 'hair'),
   ('massage_therapist', 'massage'), ('esthetician', 'facials'), ('esthetician', 'waxing'),
   ('barber', 'cuts'), ('barber', 'beard'));

-- Horarios (hora local de TCI): lunes a sábado; barberos de 10 a 19; el resto, horario partido 9–13 / 14–18.
insert into public.working_hours (professional_id, weekday, start_time, end_time)
select p.id, d, r.s::time, r.e::time
  from public.professionals p
  cross join generate_series(1, 6) d
  cross join lateral (
    select * from (values ('10:00', '19:00')) v(s, e) where p.title = 'barber'
    union all
    select * from (values ('09:00', '13:00'), ('14:00', '18:00')) v(s, e) where p.title <> 'barber'
  ) r;
