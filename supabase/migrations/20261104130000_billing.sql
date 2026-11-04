-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 012 · Facturación manual y administración de la plataforma
--   Ciclo (plan §2.2): prueba 14 días → el administrador genera la factura → el dueño paga por
--   transferencia/efectivo → el administrador registra el pago y el plan queda activo.
--   Sin pago: a los 7 días del vencimiento 'past_due' (aviso) y a los 14 'suspended'
--   (se apagan la reserva en línea y Breeze Live; NUNCA se borran datos y la agenda sigue visible).
--   Solo un perfil con is_platform_admin puede usar las RPC platform_*. El dueño ve lo suyo con my_billing().
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Ayudantes ─────────────────────────────────────────────────────────────

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

-- ¿Puede este negocio recibir reservas en línea y usar Breeze Live?
-- Activo, con pago pendiente (gracia) o en prueba. Además, aunque el barrido diario no se haya ejecutado,
-- 14 días después del vencimiento se corta igualmente.
create or replace function private.org_can_book(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.status in ('trialing', 'active', 'past_due')
       and coalesce(s.current_period_end, s.trial_ends_at, now()) + interval '14 days' >= now()
      from public.subscriptions s
     where s.organization_id = p_org
  ), false);
$$;

-- ─── Facturas: qué se facturó y número correlativo ─────────────────────────

alter table public.invoices
  add column plan_code text references public.plans (code),
  add column billing_cycle public.billing_cycle not null default 'monthly',
  add column extra_branches integer not null default 0 check (extra_branches >= 0),
  add column note text,
  add column paid_at timestamptz;

-- Una sola factura abierta por negocio.
create unique index invoices_one_open_per_org on public.invoices (organization_id) where status = 'open';

create sequence public.invoice_number_seq;
revoke all on sequence public.invoice_number_seq from public, anon, authenticated;

-- ─── Datos de pago de Breeze (una sola fila) ───────────────────────────────
-- No se lee directamente: el dueño las recibe con my_billing() y el administrador con platform_overview().

create table public.platform_settings (
  id boolean primary key default true check (id), -- fuerza una única fila
  payee_name text not null default '',
  bank_name text not null default '',
  account_number text not null default '',
  instructions_en text not null default '',
  instructions_es text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated; -- sin políticas: solo vía RPC

-- ─── Administrador de plataforma ───────────────────────────────────────────

create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(ps) - 'id' - 'updated_at' from public.platform_settings ps),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('code', pl.code, 'name', pl.name, 'monthly_price_cents', pl.monthly_price_cents,
                                          'annual_price_cents', pl.annual_price_cents, 'extra_branch_price_cents', pl.extra_branch_price_cents)
                       order by pl.sort_order)
        from public.plans pl where pl.is_active), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(r.j order by r.sev, r.due nulls last, r.created)
        from (
          select
            case s.status when 'past_due' then 0 when 'suspended' then 1 when 'trialing' then 2 when 'active' then 3 else 4 end as sev,
            coalesce(s.current_period_end, s.trial_ends_at) as due,
            o.created_at as created,
            jsonb_build_object(
              'id', o.id, 'name', o.name, 'owner_email', p.email, 'owner_name', p.full_name, 'created_at', o.created_at,
              'salons', (select count(*) from public.salons sa where sa.organization_id = o.id),
              'published_salons', (select count(*) from public.salons sa where sa.organization_id = o.id and sa.is_published),
              'plan_code', s.plan_code, 'status', s.status, 'billing_cycle', s.billing_cycle, 'extra_branches', s.extra_branches,
              'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
              'can_book', private.org_can_book(o.id),
              'open_invoice', (select jsonb_build_object('id', i.id, 'number', i.number, 'amount_cents', i.amount_cents,
                                                         'due_at', i.due_at, 'period_start', i.period_start, 'period_end', i.period_end)
                                 from public.invoices i where i.organization_id = o.id and i.status = 'open'),
              'last_payment', (select jsonb_build_object('amount_cents', pm.amount_cents, 'received_at', pm.received_at, 'method', pm.method)
                                 from public.payments pm where pm.organization_id = o.id order by pm.received_at desc limit 1)
            ) as j
          from public.organizations o
          join public.profiles p on p.id = o.owner_id
          left join public.subscriptions s on s.organization_id = o.id
        ) r), '[]'::jsonb)
  );
end;
$$;

-- Genera la factura del siguiente periodo. Importe = plan (mensual o anual = 10 meses) + sucursales extra,
-- o el que indique el administrador (descuentos, pilotos).
create or replace function public.platform_create_invoice(
  p_org uuid,
  p_cycle public.billing_cycle default null,
  p_extra_branches integer default null,
  p_plan_code text default null,
  p_amount_cents integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.plans;
  v_cycle public.billing_cycle;
  v_extra integer;
  v_mult integer;
  v_amount integer;
  v_ref timestamptz;
  v_start date;
  v_end date;
  v_number text;
  v_id uuid;
  v_tz constant text := 'America/Grand_Turk';
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.invoices where organization_id = p_org and status = 'open') then
    raise exception 'invoice_already_open' using errcode = 'P0001';
  end if;
  select * into v_plan from public.plans where code = coalesce(p_plan_code, v_sub.plan_code) and is_active;
  if not found then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;

  v_cycle := coalesce(p_cycle, v_sub.billing_cycle);
  v_extra := coalesce(p_extra_branches, v_sub.extra_branches);
  v_mult := case when v_cycle = 'annual' then 10 else 1 end;
  v_amount := coalesce(
    p_amount_cents,
    (case when v_cycle = 'annual' then v_plan.annual_price_cents else v_plan.monthly_price_cents end) + v_extra * v_plan.extra_branch_price_cents * v_mult
  );
  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- El periodo empieza donde terminó el anterior; si lleva más de 14 días vencido, empieza hoy (no se cobra retroactivo).
  v_ref := coalesce(v_sub.current_period_end, v_sub.trial_ends_at, now());
  v_start := case when v_ref >= now() - interval '14 days' then (v_ref at time zone v_tz)::date else (now() at time zone v_tz)::date end;
  v_end := (v_start + case when v_cycle = 'annual' then interval '12 months' else interval '1 month' end - interval '1 day')::date;
  v_number := 'BRZ-' || to_char(now() at time zone v_tz, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');

  insert into public.invoices (organization_id, number, period_start, period_end, amount_cents, due_at, plan_code, billing_cycle, extra_branches, note)
  values (p_org, v_number, v_start, v_end, v_amount, greatest((v_start::timestamp at time zone v_tz), now()),
          v_plan.code, v_cycle, v_extra, nullif(btrim(p_note), ''))
  returning id into v_id;

  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), p_org, 'invoice.created', 'invoices', v_id, jsonb_build_object('number', v_number, 'amount_cents', v_amount));
  return jsonb_build_object('id', v_id, 'number', v_number, 'amount_cents', v_amount, 'period_start', v_start, 'period_end', v_end);
end;
$$;

-- Registra el pago recibido (transferencia o efectivo): la factura queda pagada y el plan, activo hasta el fin del periodo.
create or replace function public.platform_register_payment(
  p_invoice uuid,
  p_method public.payment_method,
  p_reference text default null,
  p_received_at timestamptz default null,
  p_amount_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_amount integer;
  v_pay uuid;
  v_end timestamptz;
  v_tz constant text := 'America/Grand_Turk';
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'open' then
    raise exception 'invoice_not_open' using errcode = 'P0001';
  end if;
  v_amount := coalesce(p_amount_cents, v_inv.amount_cents);
  if v_amount < v_inv.amount_cents then
    raise exception 'amount_too_low' using errcode = '22023';
  end if;
  if p_received_at is not null and p_received_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  insert into public.payments (invoice_id, organization_id, method, amount_cents, reference, received_at, recorded_by)
  values (v_inv.id, v_inv.organization_id, p_method, v_amount, nullif(btrim(p_reference), ''), coalesce(p_received_at, now()), auth.uid())
  returning id into v_pay;

  update public.invoices set status = 'paid', paid_at = now() where id = v_inv.id;

  v_end := ((v_inv.period_end + 1)::timestamp at time zone v_tz);
  update public.subscriptions
     set status = 'active',
         plan_code = coalesce(v_inv.plan_code, plan_code),
         billing_cycle = v_inv.billing_cycle,
         extra_branches = v_inv.extra_branches,
         current_period_end = v_end
   where organization_id = v_inv.organization_id;

  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), v_inv.organization_id, 'payment.registered', 'payments', v_pay,
          jsonb_build_object('invoice', v_inv.number, 'amount_cents', v_amount, 'method', p_method));
  return jsonb_build_object('payment_id', v_pay, 'current_period_end', v_end);
end;
$$;

create or replace function public.platform_void_invoice(p_invoice uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'open' then
    raise exception 'invoice_not_open' using errcode = 'P0001';
  end if;
  update public.invoices set status = 'void', note = coalesce(nullif(btrim(p_reason), ''), note) where id = v_inv.id;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), v_inv.organization_id, 'invoice.voided', 'invoices', v_inv.id, jsonb_build_object('number', v_inv.number, 'reason', p_reason));
end;
$$;

-- Cortesía: da más días (alargar la prueba, esperar un pago) y, si estaba en aviso, suspendido o cancelado, lo reactiva.
create or replace function public.platform_extend(p_org uuid, p_days integer, p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_end timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_end := greatest(coalesce(v_sub.current_period_end, v_sub.trial_ends_at, now()), now()) + make_interval(days => p_days);
  update public.subscriptions
     set current_period_end = v_end,
         trial_ends_at = case when status = 'trialing' then v_end else trial_ends_at end,
         status = case when status in ('past_due', 'suspended', 'cancelled') then 'active' else status end
   where organization_id = p_org;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), p_org, 'subscription.extended', 'subscriptions', v_sub.id, jsonb_build_object('days', p_days, 'reason', p_reason));
  return v_end;
end;
$$;

-- Parar a mano un negocio. (Reactivar: platform_extend o registrar un pago.)
create or replace function public.platform_set_status(p_org uuid, p_status public.subscription_status, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('suspended', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.subscriptions set status = p_status where organization_id = p_org returning id into v_id;
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), p_org, 'subscription.' || p_status, 'subscriptions', v_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.platform_save_settings(
  p_payee_name text, p_bank_name text, p_account_number text, p_instructions_en text, p_instructions_es text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if greatest(char_length(coalesce(p_payee_name, '')), char_length(coalesce(p_bank_name, '')), char_length(coalesce(p_account_number, ''))) > 200
     or greatest(char_length(coalesce(p_instructions_en, '')), char_length(coalesce(p_instructions_es, ''))) > 1000 then
    raise exception 'too_long' using errcode = '22023';
  end if;
  update public.platform_settings
     set payee_name = btrim(coalesce(p_payee_name, '')), bank_name = btrim(coalesce(p_bank_name, '')),
         account_number = btrim(coalesce(p_account_number, '')),
         instructions_en = btrim(coalesce(p_instructions_en, '')), instructions_es = btrim(coalesce(p_instructions_es, ''));
end;
$$;

-- ─── Dueño: su plan, facturas, pagos y a dónde transferir ──────────────────

create or replace function public.my_billing(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, '{owner}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'subscription', (
      select jsonb_build_object(
               'plan_code', s.plan_code, 'plan_name', pl.name, 'status', s.status, 'billing_cycle', s.billing_cycle,
               'extra_branches', s.extra_branches, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
               'can_book', private.org_can_book(p_organization_id),
               'monthly_price_cents', pl.monthly_price_cents, 'annual_price_cents', pl.annual_price_cents,
               'extra_branch_price_cents', pl.extra_branch_price_cents)
        from public.subscriptions s join public.plans pl on pl.code = s.plan_code
       where s.organization_id = p_organization_id),
    'open_invoice', (
      select jsonb_build_object('number', i.number, 'amount_cents', i.amount_cents, 'due_at', i.due_at,
                                'period_start', i.period_start, 'period_end', i.period_end)
        from public.invoices i where i.organization_id = p_organization_id and i.status = 'open'),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object('number', x.number, 'period_start', x.period_start, 'period_end', x.period_end,
                                          'amount_cents', x.amount_cents, 'status', x.status, 'due_at', x.due_at, 'paid_at', x.paid_at)
                       order by x.created_at desc)
        from (select * from public.invoices where organization_id = p_organization_id order by created_at desc limit 12) x), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('amount_cents', y.amount_cents, 'method', y.method, 'reference', y.reference, 'received_at', y.received_at)
                       order by y.received_at desc)
        from (select * from public.payments where organization_id = p_organization_id order by received_at desc limit 12) y), '[]'::jsonb),
    'instructions', (select to_jsonb(ps) - 'id' - 'updated_at' from public.platform_settings ps)
  );
end;
$$;

-- ─── Barrido diario: aviso a los 7 días y suspensión a los 14 ──────────────

create or replace function private.billing_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suspended integer;
  v_past_due integer;
begin
  with s as (
    update public.subscriptions
       set status = 'suspended'
     where status in ('trialing', 'active', 'past_due')
       and coalesce(current_period_end, trial_ends_at) + interval '14 days' < now()
    returning id, organization_id
  ), a as (
    insert into public.audit_log (organization_id, action, entity, entity_id)
    select organization_id, 'subscription.suspended', 'subscriptions', id from s
  )
  select count(*) into v_suspended from s;

  with s as (
    update public.subscriptions
       set status = 'past_due'
     where status in ('trialing', 'active')
       and coalesce(current_period_end, trial_ends_at) + interval '7 days' < now()
    returning id, organization_id
  ), a as (
    insert into public.audit_log (organization_id, action, entity, entity_id)
    select organization_id, 'subscription.past_due', 'subscriptions', id from s
  )
  select count(*) into v_past_due from s;

  return jsonb_build_object('suspended', v_suspended, 'past_due', v_past_due);
end;
$$;

-- Se ejecuta cada día (04:15 hora de TCI). En Supabase existe pg_cron; en el Postgres de tests no.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('breeze-billing-sweep', '15 9 * * *', 'select private.billing_sweep()');
  end if;
end $$;

-- ─── Reservar y Breeze Live respetan el estado del plan ────────────────────

create or replace function public.book_appointment(
  p_salon_id uuid,
  p_items jsonb,           -- [{ "service_id": …, "professional_id": … }, …] en orden
  p_starts_at timestamptz,
  p_guest jsonb default null -- invitado: { first_name, last_name, phone, email, locale, whatsapp_opt_in }
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_customer public.customers;
  v_is_guest boolean := auth.uid() is null;
  v_token text;
  v_group uuid;
  v_ids uuid[] := '{}';
  v_item record;
  v_id uuid;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if v_salon.id is null or not v_salon.is_published or not private.org_can_book(v_salon.organization_id) then
    raise exception 'salon_not_bookable' using errcode = 'P0001';
  end if;
  if p_starts_at < now() + make_interval(mins => v_salon.min_lead_time_min) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if p_starts_at > now() + make_interval(days => v_salon.max_advance_days) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  v_customer := private.resolve_customer(v_salon.organization_id, p_guest);
  if v_salon.no_show_block_enabled
     and (v_customer.is_blocked or v_customer.no_show_count >= v_salon.no_show_threshold) then
    raise exception 'customer_blocked' using errcode = 'P0001';
  end if;
  if v_is_guest and (
    select count(distinct a.booking_group_id) from public.appointments a
     where a.customer_id = v_customer.id and a.status = 'booked' and a.starts_at > now()
  ) >= 2 then
    raise exception 'guest_limit' using errcode = 'P0001';
  end if;

  if v_is_guest then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;
  insert into public.booking_groups (organization_id, salon_id, customer_id, source, guest_token_hash, created_by)
  values (v_salon.organization_id, v_salon.id, v_customer.id, 'online',
          case when v_token is not null then sha256(convert_to(v_token, 'UTF8')) end, auth.uid())
  returning id into v_group;

  for v_item in select * from private.plan_items(p_salon_id, p_items, p_starts_at) loop
    if not exists (select 1 from public.professionals where id = v_item.professional_id and accepts_online) then
      raise exception 'invalid_items' using errcode = '22023';
    end if;
    if not private.fits_schedule(v_item.professional_id, v_salon.id, v_salon.timezone, v_item.starts_at, v_item.blocked_until) then
      raise exception 'outside_working_hours' using errcode = 'P0001';
    end if;
    insert into public.appointments
      (booking_group_id, salon_id, professional_id, customer_id, service_id, service_name_en, service_name_es,
       price_cents, starts_at, ends_at, blocked_until)
    values
      (v_group, v_salon.id, v_item.professional_id, v_customer.id, v_item.service_id, v_item.service_name_en,
       v_item.service_name_es, v_item.price_cents, v_item.starts_at, v_item.ends_at, v_item.blocked_until)
    returning id into v_id;   -- ← aquí salta 23P01 si el hueco acaba de ocuparse
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('booking_group_id', v_group, 'appointment_ids', to_jsonb(v_ids), 'guest_token', v_token);
end;
$$;

create or replace function public.get_live_board(p_salon_id uuid, p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_day date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.has_salon_role(p_salon_id, '{owner,admin,professional,display}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Plan suspendido (cobro vencido más de 14 días): Breeze Live se apaga; la agenda del panel sigue visible.
  if not private.org_can_book((select s.organization_id from public.salons s where s.id = p_salon_id)) then
    raise exception 'subscription_inactive' using errcode = 'P0001';
  end if;
  select * into v_salon from public.salons where id = p_salon_id;
  v_day := coalesce(p_day, (now() at time zone v_salon.timezone)::date);
  v_from := v_day::timestamp at time zone v_salon.timezone;
  v_to := (v_day + 1)::timestamp at time zone v_salon.timezone;

  update public.live_devices set last_seen_at = now()
   where salon_id = p_salon_id and user_id = auth.uid() and revoked_at is null;

  return jsonb_build_object(
    'salon', jsonb_build_object('id', v_salon.id, 'name', v_salon.name, 'slug', v_salon.slug, 'timezone', v_salon.timezone),
    'day', v_day,
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'public_name', p.public_name, 'initials', p.initials, 'color_hex', p.color_hex)
                       order by p.sort_order, p.created_at)
        from public.professionals p where p.salon_id = p_salon_id and p.is_active), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(private.live_appointment_json(a) order by a.starts_at)
        from public.appointments a
       where a.salon_id = p_salon_id and a.status <> 'cancelled'
         and a.starts_at >= v_from and a.starts_at < v_to), '[]'::jsonb)
  );
end;
$$;

-- ─── Permisos ──────────────────────────────────────────────────────────────
revoke execute on function public.platform_overview() from public, anon;
revoke execute on function public.platform_create_invoice(uuid, public.billing_cycle, integer, text, integer, text) from public, anon;
revoke execute on function public.platform_register_payment(uuid, public.payment_method, text, timestamptz, integer) from public, anon;
revoke execute on function public.platform_void_invoice(uuid, text) from public, anon;
revoke execute on function public.platform_extend(uuid, integer, text) from public, anon;
revoke execute on function public.platform_set_status(uuid, public.subscription_status, text) from public, anon;
revoke execute on function public.platform_save_settings(text, text, text, text, text) from public, anon;
revoke execute on function public.my_billing(uuid) from public, anon;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_create_invoice(uuid, public.billing_cycle, integer, text, integer, text) to authenticated;
grant execute on function public.platform_register_payment(uuid, public.payment_method, text, timestamptz, integer) to authenticated;
grant execute on function public.platform_void_invoice(uuid, text) to authenticated;
grant execute on function public.platform_extend(uuid, integer, text) to authenticated;
grant execute on function public.platform_set_status(uuid, public.subscription_status, text) to authenticated;
grant execute on function public.platform_save_settings(text, text, text, text, text) to authenticated;
grant execute on function public.my_billing(uuid) to authenticated;
