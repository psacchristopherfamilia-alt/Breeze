-- ════════════════════════════════════════════════════════════════════════════
-- Reseñas verificadas: solo quien tuvo la cita puede opinar (1 a 5 estrellas + comentario opcional).
-- El salón responde y puede reportar; solo el administrador de la plataforma oculta.
-- Todo el acceso es por RPC: la tabla no tiene permisos directos para nadie.
-- ════════════════════════════════════════════════════════════════════════════

create type public.review_status as enum ('visible', 'reported', 'hidden');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  salon_id uuid not null,
  booking_group_id uuid not null,
  -- Profesional de la primera cita de la reserva (si se borra, la reseña se queda en el salón).
  professional_id uuid references public.professionals (id) on delete set null,
  -- "Juan P." tal como se verá en público (copia en el momento de opinar).
  author_name text not null default '',
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(btrim(comment)) between 1 and 500),
  service_en text not null default '',
  service_es text not null default '',
  status public.review_status not null default 'visible',
  reply text check (reply is null or char_length(btrim(reply)) between 1 and 500),
  replied_at timestamptz,
  replied_by uuid references public.profiles (id) on delete set null,
  reported_reason text check (reported_reason is null or char_length(btrim(reported_reason)) between 3 and 300),
  reported_at timestamptz,
  reported_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  moderated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (booking_group_id, salon_id) references public.booking_groups (id, salon_id) on delete cascade,
  foreign key (salon_id, organization_id) references public.salons (id, organization_id) on delete cascade,
  unique (booking_group_id)
);
create index reviews_salon_idx on public.reviews (salon_id, created_at desc) where status <> 'hidden';
create index reviews_professional_idx on public.reviews (professional_id) where status <> 'hidden';
create index reviews_reported_idx on public.reviews (reported_at) where status = 'reported';
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

-- ─── Promedio del salón (público) ──────────────────────────────────────────
alter table public.salons
  add column rating_avg numeric(2, 1),
  add column rating_count integer not null default 0;
grant select (rating_avg, rating_count) on public.salons to anon;

create or replace function private.refresh_salon_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid := coalesce(new.salon_id, old.salon_id);
begin
  update public.salons s
     set rating_count = x.c, rating_avg = x.a
    from (select count(*)::integer c, round(avg(rating)::numeric, 1) a
            from public.reviews where salon_id = v_salon and status in ('visible', 'reported')) x
   where s.id = v_salon;
  return null;
end;
$$;
create trigger reviews_refresh_rating after insert or delete or update of rating, status on public.reviews
  for each row execute function private.refresh_salon_rating();

-- ─── Aviso al equipo cuando entra una reseña ───────────────────────────────
alter table public.staff_alerts drop constraint staff_alerts_kind_check;
alter table public.staff_alerts
  add constraint staff_alerts_kind_check check (kind in ('booked', 'rescheduled', 'cancelled', 'review')),
  add column rating smallint check (rating between 1 and 5);

-- ─── Ayudantes ─────────────────────────────────────────────────────────────
-- 'ok' | 'too_early' (la cita aún no pasó) | 'not_reviewable' (cancelada o no se presentó) | 'expired' (pasaron 14 días)
-- Cuenta como atendida: marcada «completada», o reservada y terminada hace más de 1 hora
-- (no todos los salones marcan sus citas; si no vino, el salón puede reportar la reseña).
create or replace function private.review_window(p_group uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
  v_pending boolean;
begin
  select max(a.ends_at) filter (where a.status = 'completed' or (a.status = 'booked' and a.ends_at <= now() - interval '1 hour')),
         coalesce(bool_or(a.status = 'booked' and a.ends_at > now() - interval '1 hour'), false)
    into v_end, v_pending
    from public.appointments a where a.booking_group_id = p_group;
  if v_end is null then
    return case when v_pending then 'too_early' else 'not_reviewable' end;
  end if;
  if now() > v_end + interval '14 days' then
    return 'expired';
  end if;
  return 'ok';
end;
$$;

-- El enlace del invitado (el mismo de /b/[token], 64 hex) o, con sesión, el id de la reserva propia.
create or replace function private.review_group(p_ref text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  if p_ref ~ '^[0-9a-f]{64}$' then
    return private.group_by_token(p_ref);
  elsif p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select bg.id into v_group from public.booking_groups bg
     where bg.id = p_ref::uuid and bg.customer_id in (select private.my_customer_ids());
    return v_group;
  end if;
  return null;
end;
$$;

-- Nombre público de una reseña; vacío si esa cuenta se eliminó.
create or replace function private.review_author(p_review public.reviews)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.booking_groups bg join public.customers c on c.id = bg.customer_id
                  where bg.id = p_review.booking_group_id and c.first_name = 'Deleted account') then ''
    else p_review.author_name
  end;
$$;

create or replace function private.review_json(r public.reviews, p_staff boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'rating', r.rating, 'comment', r.comment,
    'author', private.review_author(r),
    'service_en', r.service_en, 'service_es', r.service_es,
    'pro_name', coalesce((select p.public_name from public.professionals p where p.id = r.professional_id), ''),
    'created_at', r.created_at, 'reply', r.reply, 'replied_at', r.replied_at
  ) || case when p_staff then jsonb_build_object('status', r.status, 'reported_reason', r.reported_reason) else '{}'::jsonb end;
$$;

-- ─── El cliente deja (o edita) su reseña ───────────────────────────────────
create or replace function public.get_review_request(p_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.review_group(p_ref);
  v_state text;
  v_rev public.reviews;
  v_lead public.appointments;
  v_salon public.salons;
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.appointments where booking_group_id = v_group order by starts_at limit 1;
  select * into v_salon from public.salons where id = v_lead.salon_id;
  select * into v_rev from public.reviews where booking_group_id = v_group;
  v_state := private.review_window(v_group);
  if v_state = 'expired' and v_rev.id is not null then
    v_state := 'reviewed';
  end if;
  return jsonb_build_object(
    'state', v_state,
    'salon', jsonb_build_object('name', v_salon.name, 'slug', v_salon.slug),
    'pro_name', coalesce((select p.public_name from public.professionals p where p.id = v_lead.professional_id), ''),
    'service_en', (select string_agg(a.service_name_en, ' + ' order by a.starts_at) from public.appointments a where a.booking_group_id = v_group),
    'service_es', (select string_agg(a.service_name_es, ' + ' order by a.starts_at) from public.appointments a where a.booking_group_id = v_group),
    'starts_at', v_lead.starts_at,
    'customer_display', coalesce(v_lead.customer_display, ''),
    'review', case when v_rev.id is null then null else jsonb_build_object('rating', v_rev.rating, 'comment', v_rev.comment, 'status', v_rev.status) end
  );
end;
$$;

create or replace function public.submit_review(p_ref text, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := private.review_group(p_ref);
  v_state text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_lead public.appointments;
  v_salon public.salons;
  v_id uuid;
  v_inserted boolean;
  v_en text;
  v_es text;
  v_pro text;
begin
  if v_group is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;
  if p_rating <= 2 and v_comment is null then
    raise exception 'comment_required' using errcode = '22023';
  end if;
  v_state := private.review_window(v_group);
  if v_state <> 'ok' then
    raise exception '%', v_state using errcode = 'P0001';
  end if;

  select * into v_lead from public.appointments where booking_group_id = v_group order by starts_at limit 1;
  select * into v_salon from public.salons where id = v_lead.salon_id;
  select string_agg(a.service_name_en, ' + ' order by a.starts_at), string_agg(a.service_name_es, ' + ' order by a.starts_at)
    into v_en, v_es from public.appointments a where a.booking_group_id = v_group;
  select p.public_name into v_pro from public.professionals p where p.id = v_lead.professional_id;

  insert into public.reviews (organization_id, salon_id, booking_group_id, professional_id, author_name, rating, comment, service_en, service_es)
  values (v_salon.organization_id, v_salon.id, v_group, v_lead.professional_id, coalesce(v_lead.customer_display, ''), p_rating, v_comment, coalesce(v_en, ''), coalesce(v_es, ''))
  on conflict (booking_group_id) do update
    set rating = excluded.rating, comment = excluded.comment
    where public.reviews.status <> 'hidden'
  returning id, (xmax = 0) into v_id, v_inserted;
  if v_id is null then
    raise exception 'review_hidden' using errcode = 'P0001';
  end if;

  -- Solo la reseña nueva avisa al equipo (editar no vuelve a avisar).
  if v_inserted then
    insert into public.staff_alerts (user_id, salon_id, booking_group_id, kind, rating, customer_display, service_en, service_es, pro_name, starts_at)
    select distinct m.user_id, v_salon.id, v_group, 'review', p_rating, coalesce(v_lead.customer_display, ''), coalesce(v_en, ''), coalesce(v_es, ''), coalesce(v_pro, ''), v_lead.starts_at
      from public.memberships m
     where m.organization_id = v_salon.organization_id
       and (
         (m.role in ('owner', 'admin') and (m.salon_id is null or m.salon_id = v_salon.id))
         or (m.role = 'professional' and m.professional_id = v_lead.professional_id)
       );
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Reservas propias que se pueden reseñar o ya tienen reseña (para «Mis citas»).
create or replace function public.my_review_states()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('booking_group_id', x.id, 'state', x.state, 'rating', x.rating)), '[]'::jsonb)
    from (
      select bg.id,
             case when r.id is not null then 'reviewed' else private.review_window(bg.id) end as state,
             r.rating
        from public.booking_groups bg
        left join public.reviews r on r.booking_group_id = bg.id
       where bg.customer_id in (select private.my_customer_ids())
    ) x
   where x.state in ('ok', 'reviewed');
$$;

-- ─── Lectura pública ───────────────────────────────────────────────────────
create or replace function public.get_salon_reviews(p_salon_id uuid, p_limit integer default 10, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not (private.is_published_salon(p_salon_id) or private.has_salon_role(p_salon_id, '{owner,admin,professional}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'count', (select count(*) from public.reviews where salon_id = p_salon_id and status in ('visible', 'reported')),
    'avg', (select round(avg(rating)::numeric, 1) from public.reviews where salon_id = p_salon_id and status in ('visible', 'reported')),
    'distribution', (
      select jsonb_object_agg(g.n::text, (select count(*) from public.reviews r where r.salon_id = p_salon_id and r.status in ('visible', 'reported') and r.rating = g.n))
        from generate_series(1, 5) g(n)),
    'pros', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'avg', x.a, 'count', x.c))
        from (select professional_id id, round(avg(rating)::numeric, 1) a, count(*) c
                from public.reviews
               where salon_id = p_salon_id and status in ('visible', 'reported') and professional_id is not null
               group by professional_id) x), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(private.review_json(r, false) order by r.created_at desc)
        from (select * from public.reviews where salon_id = p_salon_id and status in ('visible', 'reported')
               order by created_at desc limit v_limit offset v_offset) r), '[]'::jsonb)
  );
end;
$$;

-- ─── Panel del salón ───────────────────────────────────────────────────────
-- Dueño/admin ven todas las del salón (incluidas las reportadas); el profesional, solo las suyas.
create or replace function public.staff_reviews(p_salon_id uuid, p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_manager boolean := private.has_salon_role(p_salon_id, '{owner,admin}');
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if not (v_manager or private.has_salon_role(p_salon_id, '{professional}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.review_json(r, true) order by r.created_at desc)
      from (select * from public.reviews
             where salon_id = p_salon_id and status <> 'hidden'
               and (v_manager or professional_id in (select private.my_professional_ids()))
             order by created_at desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb);
end;
$$;

create or replace function public.reply_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviews;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select * into v_rev from public.reviews where id = p_review_id;
  if not found or v_rev.status = 'hidden' or not private.has_salon_role(v_rev.salon_id, '{owner,admin}') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_reply is not null and char_length(v_reply) > 500 then
    raise exception 'reply_too_long' using errcode = '22023';
  end if;
  update public.reviews
     set reply = v_reply, replied_at = case when v_reply is null then null else now() end,
         replied_by = case when v_reply is null then null else auth.uid() end
   where id = p_review_id;
end;
$$;

-- Reportar NO oculta nada: manda la reseña a la cola del administrador de la plataforma.
create or replace function public.report_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviews;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_rev from public.reviews where id = p_review_id;
  if not found or not private.has_salon_role(v_rev.salon_id, '{owner,admin}') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'visible' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.reviews
     set status = 'reported', reported_reason = v_reason, reported_at = now(), reported_by = auth.uid()
   where id = p_review_id;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), v_rev.organization_id, 'review.reported', 'reviews', v_rev.id, jsonb_build_object('reason', v_reason));
end;
$$;

-- ─── Administrador de la plataforma ─────────────────────────────────────────
create or replace function public.platform_reported_reviews()
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
  return coalesce((
    select jsonb_agg(private.review_json(r, true) || jsonb_build_object('salon_name', s.name, 'reported_at', r.reported_at) order by r.reported_at)
      from public.reviews r join public.salons s on s.id = r.salon_id
     where r.status = 'reported'), '[]'::jsonb);
end;
$$;

-- 'hide' la oculta (sale de la página y del promedio, pero no se borra); 'keep' la deja visible.
create or replace function public.platform_moderate_review(p_review_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.reviews;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('hide', 'keep') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select * into v_rev from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'reported' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.reviews
     set status = case p_action when 'hide' then 'hidden'::public.review_status else 'visible'::public.review_status end,
         moderated_at = now(), moderated_by = auth.uid()
   where id = p_review_id;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id, diff)
  values (auth.uid(), v_rev.organization_id, 'review.' || p_action, 'reviews', v_rev.id, jsonb_build_object('rating', v_rev.rating));
end;
$$;

-- ─── Permisos ──────────────────────────────────────────────────────────────
revoke execute on function public.get_review_request(text) from public;
revoke execute on function public.submit_review(text, integer, text) from public;
revoke execute on function public.my_review_states() from public, anon;
revoke execute on function public.get_salon_reviews(uuid, integer, integer) from public;
revoke execute on function public.staff_reviews(uuid, integer, integer) from public, anon;
revoke execute on function public.reply_review(uuid, text) from public, anon;
revoke execute on function public.report_review(uuid, text) from public, anon;
revoke execute on function public.platform_reported_reviews() from public, anon;
revoke execute on function public.platform_moderate_review(uuid, text) from public, anon;
-- Reseñar: invitados (con su enlace) y cuentas. Leer: cualquiera.
grant execute on function public.get_review_request(text) to anon, authenticated;
grant execute on function public.submit_review(text, integer, text) to anon, authenticated;
grant execute on function public.get_salon_reviews(uuid, integer, integer) to anon, authenticated;
grant execute on function public.my_review_states() to authenticated;
grant execute on function public.staff_reviews(uuid, integer, integer) to authenticated;
grant execute on function public.reply_review(uuid, text) to authenticated;
grant execute on function public.report_review(uuid, text) to authenticated;
grant execute on function public.platform_reported_reviews() to authenticated;
grant execute on function public.platform_moderate_review(uuid, text) to authenticated;
