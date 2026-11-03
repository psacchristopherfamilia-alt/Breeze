-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 008 · Panel del salón: operaciones atómicas de gestión
--   Lo simple (servicios, profesionales, ajustes, días libres, cierres) se escribe
--   directamente con RLS. Esto es lo que necesita varias filas a la vez o reglas extra.
-- ════════════════════════════════════════════════════════════════════════════

-- Sustituye el horario semanal de un profesional (hora local del salón).
-- p_hours: [{ "weekday": 1, "start": "09:00", "end": "13:00" }, …]  — sin solapes en el mismo día.
create or replace function public.set_working_hours(p_professional_id uuid, p_hours jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid := private.salon_of_professional(p_professional_id);
  v_n integer;
begin
  if v_salon is null or not private.has_salon_role(v_salon, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;

  create temp table _wh on commit drop as
  select (h ->> 'weekday')::smallint as weekday, (h ->> 'start')::time as s, (h ->> 'end')::time as e
    from jsonb_array_elements(p_hours) h;

  if exists (select 1 from _wh where weekday is null or weekday not between 0 and 6 or s is null or e is null or e <= s) then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;
  if exists (
    select 1 from _wh a join _wh b on a.weekday = b.weekday and a.ctid < b.ctid
     where a.s < b.e and b.s < a.e
  ) then
    raise exception 'overlapping_hours' using errcode = '22023';
  end if;

  delete from public.working_hours where professional_id = p_professional_id;
  insert into public.working_hours (professional_id, weekday, start_time, end_time)
  select p_professional_id, weekday, s, e from _wh order by weekday, s;
  get diagnostics v_n = row_count;
  drop table _wh;
  return v_n;
end;
$$;

-- Sustituye la lista de servicios que ofrece un profesional (todos de su misma sucursal).
create or replace function public.set_professional_services(p_professional_id uuid, p_service_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salon uuid := private.salon_of_professional(p_professional_id);
begin
  if v_salon is null or not private.has_salon_role(v_salon, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_service_ids, '{}')) sid
     where not exists (select 1 from public.services s where s.id = sid and s.salon_id = v_salon)
  ) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;

  delete from public.professional_services
   where professional_id = p_professional_id and not (service_id = any (coalesce(p_service_ids, '{}')));
  insert into public.professional_services (professional_id, service_id, salon_id)
  select p_professional_id, sid, v_salon from unnest(coalesce(p_service_ids, '{}')) sid
  on conflict (professional_id, service_id) do nothing;
  return coalesce(array_length(p_service_ids, 1), 0);
end;
$$;

-- Publicar / ocultar la sucursal. Para publicar debe poder recibir reservas:
-- al menos un profesional activo con horario y con un servicio activo asignado.
create or replace function public.set_salon_published(p_salon_id uuid, p_published boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_salon_role(p_salon_id, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_published and not exists (
    select 1
      from public.professionals p
      join public.professional_services ps on ps.professional_id = p.id
      join public.services s on s.id = ps.service_id and s.is_active
     where p.salon_id = p_salon_id and p.is_active
       and exists (select 1 from public.working_hours wh where wh.professional_id = p.id)
  ) then
    raise exception 'salon_incomplete' using errcode = 'P0001';
  end if;

  update public.salons set is_published = p_published where id = p_salon_id;
  insert into public.audit_log (actor_id, organization_id, action, entity, entity_id)
  select auth.uid(), organization_id, case when p_published then 'salon.published' else 'salon.unpublished' end, 'salons', id
    from public.salons where id = p_salon_id;
  return p_published;
end;
$$;

-- Publicar solo se hace con set_salon_published (que valida); la edición directa no puede tocarlo.
revoke update on public.salons from authenticated;
grant update (name, address, phone, business_types, zone, slot_step_min, min_lead_time_min, max_advance_days,
              cancellation_window_hours, no_show_block_enabled, no_show_threshold, reminder_offsets_min)
  on public.salons to authenticated;

revoke execute on function public.set_working_hours(uuid, jsonb) from public, anon;
revoke execute on function public.set_professional_services(uuid, uuid[]) from public, anon;
revoke execute on function public.set_salon_published(uuid, boolean) from public, anon;
grant execute on function public.set_working_hours(uuid, jsonb) to authenticated;
grant execute on function public.set_professional_services(uuid, uuid[]) to authenticated;
grant execute on function public.set_salon_published(uuid, boolean) to authenticated;
