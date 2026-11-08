-- ════════════════════════════════════════════════════════════════════════════
-- Informes del dueño: ingresos, citas atendidas, ticket medio, ocupación, servicios, clientes nuevos y que
-- vuelven, y horas pico. Una sola función; la base de datos comprueba quién puede ver qué.
--  · Dueño y administradores de la sucursal: todo. Profesional: solo sus propias cifras (y sin lista de clientes).
--  · «Atendida» = completada, o reservada y terminada hace más de 1 hora (muchos salones no marcan sus citas).
--    No cuentan canceladas ni «no vino». El importe es el precio de lista que tenía el servicio al reservar.
--  · Ocupación = minutos con cita (no canceladas) ÷ minutos de horario, menos días libres y cierres.
--  · Días y horas se agrupan en la hora del salón (Turks and Caicos), también con el cambio de horario de verano.
-- ════════════════════════════════════════════════════════════════════════════

-- Minutos de horario por profesional en un rango, sin días libres ni cierres.
create or replace function private.report_open_minutes(p_salon uuid, p_from timestamptz, p_to timestamptz, p_pros uuid[])
returns table (professional_id uuid, mins numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (select s.timezone z from public.salons s where s.id = p_salon),
  days as (
    select generate_series(
             (p_from at time zone (select z from tz))::date,
             ((p_to - interval '1 second') at time zone (select z from tz))::date,
             interval '1 day')::date as d
  ),
  shifts as (
    select wh.professional_id as pro_id,
           ((days.d + wh.start_time) at time zone (select z from tz)) as s,
           ((days.d + wh.end_time) at time zone (select z from tz)) as e
      from days
      join public.working_hours wh on wh.weekday = extract(dow from days.d)::int
      join public.professionals p on p.id = wh.professional_id and p.salon_id = p_salon
     where p.id = any (p_pros)
  )
  select sh.pro_id,
         coalesce(sum(extract(epoch from (upper(r) - lower(r))) / 60), 0)::numeric
    from shifts sh
    cross join lateral unnest(
      tstzmultirange(tstzrange(sh.s, sh.e))
      - coalesce((select range_agg(tstzrange(t.starts_at, t.ends_at)) from public.time_off t
                   where t.professional_id = sh.pro_id and tstzrange(t.starts_at, t.ends_at) && tstzrange(sh.s, sh.e)), '{}'::tstzmultirange)
      - coalesce((select range_agg(tstzrange(c.starts_at, c.ends_at)) from public.salon_closures c
                   where c.salon_id = p_salon and tstzrange(c.starts_at, c.ends_at) && tstzrange(sh.s, sh.e)), '{}'::tstzmultirange)
    ) as r
   group by sh.pro_id;
$$;

-- Cifras de un periodo (para el periodo actual y el anterior).
create or replace function private.report_totals(p_salon uuid, p_from timestamptz, p_to timestamptz, p_pros uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with att as (
    select a.price_cents
      from public.appointments a
     where a.salon_id = p_salon and a.professional_id = any (p_pros)
       and a.starts_at >= p_from and a.starts_at < p_to
       and (a.status = 'completed' or (a.status = 'booked' and a.ends_at <= now() - interval '1 hour'))
  ),
  booked as (
    select coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60), 0) as m
      from public.appointments a
     where a.salon_id = p_salon and a.professional_id = any (p_pros)
       and a.starts_at >= p_from and a.starts_at < p_to and a.status <> 'cancelled'
  ),
  open as (select coalesce(sum(mins), 0) as m from private.report_open_minutes(p_salon, p_from, p_to, p_pros))
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(price_cents) from att), 0),
    'appointments', (select count(*) from att),
    'avg_ticket_cents', coalesce((select round(avg(price_cents)) from att), 0),
    'booked_min', round((select m from booked)),
    'open_min', round((select m from open)),
    'occupancy_pct', case when (select m from open) > 0 then least(100, round((select m from booked) / (select m from open) * 100)) else 0 end
  );
$$;

create or replace function public.staff_report(p_salon_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_salon public.salons;
  v_manager boolean := private.has_salon_role(p_salon_id, '{owner,admin}');
  v_pros uuid[];
  v_prev_from timestamptz;
  v_result jsonb;
begin
  select * into v_salon from public.salons where id = p_salon_id;
  if not found or not (v_manager or private.has_salon_role(p_salon_id, '{professional}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  -- Alcance: el dueño/administrador ve toda la sucursal; el profesional, solo lo suyo.
  if v_manager then
    select coalesce(array_agg(p.id), '{}') into v_pros from public.professionals p where p.salon_id = p_salon_id;
  else
    select coalesce(array_agg(p.id), '{}') into v_pros
      from public.professionals p where p.salon_id = p_salon_id and p.id in (select private.my_professional_ids());
  end if;
  v_prev_from := p_from - (p_to - p_from);

  v_result := jsonb_build_object(
    'current', private.report_totals(p_salon_id, p_from, p_to, v_pros),
    'previous', private.report_totals(p_salon_id, v_prev_from, p_from, v_pros),
    'by_pro', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.public_name, 'color_hex', p.color_hex,
               'revenue_cents', t.r->'revenue_cents', 'appointments', t.r->'appointments', 'occupancy_pct', t.r->'occupancy_pct')
             order by (t.r->>'revenue_cents')::bigint desc, p.public_name)
        from public.professionals p
        cross join lateral (select private.report_totals(p_salon_id, p_from, p_to, array[p.id]) as r) t
       where p.id = any (v_pros) and (p.is_active or (t.r->>'appointments')::int > 0)), '[]'::jsonb),
    'by_service', coalesce((
      select jsonb_agg(x order by (x->>'revenue_cents')::bigint desc)
        from (
          select jsonb_build_object('name_en', a.service_name_en, 'name_es', a.service_name_es,
                                    'appointments', count(*), 'revenue_cents', sum(a.price_cents)) as x
            from public.appointments a
           where a.salon_id = p_salon_id and a.professional_id = any (v_pros)
             and a.starts_at >= p_from and a.starts_at < p_to
             and (a.status = 'completed' or (a.status = 'booked' and a.ends_at <= now() - interval '1 hour'))
           group by a.service_name_en, a.service_name_es
           order by sum(a.price_cents) desc limit 8) s), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hr, 'count', h.n))
        from (
          select extract(dow from (a.starts_at at time zone v_salon.timezone))::int as dow,
                 extract(hour from (a.starts_at at time zone v_salon.timezone))::int as hr,
                 count(*) as n
            from public.appointments a
           where a.salon_id = p_salon_id and a.professional_id = any (v_pros)
             and a.starts_at >= p_from and a.starts_at < p_to and a.status <> 'cancelled'
           group by 1, 2) h), '[]'::jsonb)
  );

  -- Clientes: nuevos (su primera visita atendida cae en el periodo) y que vuelven (ya habían venido antes).
  v_result := v_result || jsonb_build_object('clients', (
    with att as (
      select a.customer_id, a.starts_at
        from public.appointments a
       where a.salon_id = p_salon_id and a.professional_id = any (v_pros)
         and (a.status = 'completed' or (a.status = 'booked' and a.ends_at <= now() - interval '1 hour'))
    ),
    first_visit as (select customer_id, min(starts_at) as f from att group by customer_id),
    in_period as (select distinct customer_id from att where starts_at >= p_from and starts_at < p_to)
    select jsonb_build_object(
      'new', (select count(*) from in_period ip join first_visit fv using (customer_id) where fv.f >= p_from),
      'returning', (select count(*) from in_period ip join first_visit fv using (customer_id) where fv.f < p_from)
    )
  ));

  -- Quiénes llevan tiempo sin volver: solo dueño/administrador (nombre, nunca teléfono ni correo).
  if v_manager then
    v_result := v_result || jsonb_build_object('lapsed', coalesce((
      select jsonb_agg(l order by (l->>'last_visit') desc)
        from (
          select jsonb_build_object('customer_id', c.id, 'name', private.short_name(c.first_name, c.last_name), 'last_visit', max(a.starts_at)) as l
            from public.appointments a
            join public.customers c on c.id = a.customer_id
           where a.salon_id = p_salon_id
             and (a.status = 'completed' or (a.status = 'booked' and a.ends_at <= now() - interval '1 hour'))
             and c.first_name <> 'Deleted account'
           group by c.id, c.first_name, c.last_name
          having max(a.starts_at) < now() - interval '42 days'
             and not exists (select 1 from public.appointments f where f.customer_id = c.id and f.salon_id = p_salon_id
                                and f.status = 'booked' and f.starts_at > now())
           order by max(a.starts_at) desc limit 10) q), '[]'::jsonb));
  else
    v_result := v_result || jsonb_build_object('lapsed', null);
  end if;
  return v_result;
end;
$$;

revoke execute on function public.staff_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_report(uuid, timestamptz, timestamptz) to authenticated;
