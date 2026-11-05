-- Avisos al equipo cuando entra, cambia o se cancela una reserva.
-- Reciben el aviso: dueño y administradores de la sucursal y el profesional de esa cita
-- (nunca quien hizo el cambio). Se ven en la campana del panel y, si lo activaron, en su teléfono.

create table public.staff_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_group_id uuid references public.booking_groups (id) on delete cascade,
  kind text not null check (kind in ('booked', 'rescheduled', 'cancelled')),
  -- Solo datos públicos: "Juan P.", servicio, profesional y hora. Nunca teléfono ni correo.
  customer_display text not null default '',
  service_en text not null default '',
  service_es text not null default '',
  pro_name text not null default '',
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index staff_alerts_user_idx on public.staff_alerts (user_id, created_at desc);
create index staff_alerts_unread_idx on public.staff_alerts (user_id) where read_at is null;

alter table public.staff_alerts enable row level security;
revoke all on public.staff_alerts from anon, authenticated;
grant select on public.staff_alerts to authenticated;
grant update (read_at) on public.staff_alerts to authenticated;
create policy "aviso: cada persona ve los suyos" on public.staff_alerts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "aviso: cada persona marca los suyos como leídos" on public.staff_alerts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Teléfonos/navegadores que activaron los avisos (Web Push). Las llaves solo las lee el servidor.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, user_id, endpoint, user_agent, created_at) on public.push_subscriptions to authenticated;
create policy "push: cada persona ve los suyos" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;
  -- Un teléfono compartido pasa a ser de quien lo activó por última vez.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ─── Generar los avisos ────────────────────────────────────────────────────
create or replace function private.alert_group(p_group uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.appointments;
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_en text;
  v_es text;
  v_pro text;
begin
  select * into v_lead from public.appointments where booking_group_id = p_group order by starts_at limit 1;
  if not found then
    return;
  end if;
  select s.organization_id into v_org from public.salons s where s.id = v_lead.salon_id;
  select string_agg(a.service_name_en, ' + ' order by a.starts_at), string_agg(a.service_name_es, ' + ' order by a.starts_at)
    into v_en, v_es from public.appointments a where a.booking_group_id = p_group;
  select p.public_name into v_pro from public.professionals p where p.id = v_lead.professional_id;

  insert into public.staff_alerts (user_id, salon_id, booking_group_id, kind, customer_display, service_en, service_es, pro_name, starts_at)
  select distinct m.user_id, v_lead.salon_id, p_group, p_kind, coalesce(v_lead.customer_display, ''), coalesce(v_en, ''), coalesce(v_es, ''), coalesce(v_pro, ''), v_lead.starts_at
    from public.memberships m
   where m.organization_id = v_org
     and (
       (m.role in ('owner', 'admin') and (m.salon_id is null or m.salon_id = v_lead.salon_id))
       or (m.role = 'professional' and m.professional_id = v_lead.professional_id)
     )
     and m.user_id is distinct from v_actor; -- quien hizo el cambio ya lo sabe
end;
$$;

create or replace function private.alert_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    v_kind := case when new.status = 'booked' then 'booked' end;
  elsif new.status = 'cancelled' and old.status = 'booked' then
    v_kind := 'cancelled';
  elsif new.status = 'booked' and old.status = 'booked'
        and (new.starts_at is distinct from old.starts_at or new.professional_id is distinct from old.professional_id) then
    v_kind := 'rescheduled';
  end if;
  if v_kind is null then
    return null;
  end if;
  -- Una reserva con varios servicios cambia varias filas en la misma transacción: un solo aviso.
  if exists (select 1 from public.staff_alerts a where a.booking_group_id = new.booking_group_id and a.kind = v_kind and a.created_at = now()) then
    return null;
  end if;
  perform private.alert_group(new.booking_group_id, v_kind);
  return null;
end;
$$;

-- DIFERIDO: se ejecuta al terminar la transacción, cuando ya existen todos los servicios de la reserva
-- (así el aviso dice "Corte + barba" y no solo el primero).
create constraint trigger appointments_staff_alerts
  after insert or update of status, starts_at, professional_id on public.appointments
  deferrable initially deferred
  for each row execute function private.alert_on_appointment();

-- ─── Tiempo real (la campana se actualiza sola) y push ─────────────────────
create or replace function private.alert_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return null;
  end if;
  execute 'select realtime.send($1, $2, $3, true)'
    using jsonb_build_object('id', new.id, 'kind', new.kind), 'alert', 'alerts:' || new.user_id::text;
  return null;
end;
$$;
create trigger staff_alerts_broadcast after insert on public.staff_alerts
  for each row execute function private.alert_broadcast();

-- Pide al servidor de la app que envíe el push. Usa pg_net y los mismos secretos de Vault que el worker de
-- recordatorios. Si algo falta o falla, no pasa nada: la reserva nunca se bloquea por un aviso.
create or replace function private.alert_dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
    return null;
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = ''breeze_app_url''' into v_url;
    execute 'select decrypted_secret from vault.decrypted_secrets where name = ''breeze_cron_secret''' into v_secret;
    if v_url is null or v_secret is null then
      return null;
    end if;
    execute 'select net.http_post(url := $1 || ''/api/push/send'', headers := jsonb_build_object(''Authorization'', ''Bearer '' || $2, ''Content-Type'', ''application/json''), body := jsonb_build_object(''alert_id'', $3), timeout_milliseconds := 10000)'
      using v_url, v_secret, new.id::text;
  exception when others then
    null;
  end;
  return null;
end;
$$;
create trigger staff_alerts_push after insert on public.staff_alerts
  for each row execute function private.alert_dispatch_push();

-- Canal privado de Realtime por persona: alerts:<user_id>. Solo su dueño puede leerlo.
create or replace function private.alert_topic_user(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_topic ~ '^alerts:[0-9a-f-]{36}$' then substr(p_topic, 8)::uuid end;
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "avisos: leer solo el canal propio" on realtime.messages
        for select to authenticated
        using (private.alert_topic_user((select realtime.topic())) = (select auth.uid()))
    $p$;
  end if;
end $$;
