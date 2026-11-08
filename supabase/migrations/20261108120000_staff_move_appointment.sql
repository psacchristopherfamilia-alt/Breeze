-- ════════════════════════════════════════════════════════════════════════════
-- Mover una cita desde la agenda (arrastrar o «Mover…»): hora, día, profesional y duración.
-- La base de datos decide: nadie choca con otra cita (ni el profesional ni el cliente), la cita cabe en
-- el horario del profesional, sin días libres ni cierres, y el profesional ofrece ese servicio.
-- ════════════════════════════════════════════════════════════════════════════

-- El aviso de cambio al cliente ahora también salta al cambiar de profesional (antes solo con la hora)
-- y se puede omitir con `breeze.skip_move_notice` (lo pone staff_move_appointment cuando el salón
-- desmarca «Avisar al cliente»). Los recordatorios SÍ se recalculan siempre con la hora nueva.
create or replace function private.enqueue_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_active integer;
begin
  select * into v_customer from public.customers where id = new.customer_id;

  if tg_op = 'INSERT' then
    -- Solo la primera cita de la reserva crea la confirmación (las siguientes son más tarde).
    if new.status = 'booked' and new.starts_at > now() and not exists (
      select 1 from public.notification_jobs where booking_group_id = new.booking_group_id and kind = 'confirmation'
    ) then
      insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
      values (new.id, new.booking_group_id, new.salon_id, 'confirmation', private.preferred_channel(v_customer), v_customer.locale, now());
      perform private.schedule_reminders(new.booking_group_id);
    end if;
    return null;
  end if;

  -- Cancelación: cuando ya no queda ninguna cita activa en la reserva.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select count(*) into v_active from public.appointments
     where booking_group_id = new.booking_group_id and status = 'booked';
    if v_active = 0 then
      update public.notification_jobs set status = 'skipped'
       where booking_group_id = new.booking_group_id and status = 'pending' and kind <> 'cancellation';
      if new.starts_at > now() and not exists (
        select 1 from public.notification_jobs where booking_group_id = new.booking_group_id and kind = 'cancellation'
      ) then
        insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
        values (new.id, new.booking_group_id, new.salon_id, 'cancellation', private.preferred_channel(v_customer), v_customer.locale, now());
      end if;
    end if;
    return null;
  end if;

  -- Cambio de hora o de profesional: recalcula recordatorios y avisa una sola vez.
  if new.status = 'booked' and (new.starts_at is distinct from old.starts_at or new.professional_id is distinct from old.professional_id) then
    if new.starts_at is distinct from old.starts_at then
      perform private.schedule_reminders(new.booking_group_id);
    end if;
    if new.starts_at > now()
       and coalesce(current_setting('breeze.skip_move_notice', true), '') <> 'on'
       and not exists (
         select 1 from public.notification_jobs
          where booking_group_id = new.booking_group_id and kind = 'reschedule' and status = 'pending'
       ) then
      insert into public.notification_jobs (appointment_id, booking_group_id, salon_id, kind, channel, locale, scheduled_for)
      values (new.id, new.booking_group_id, new.salon_id, 'reschedule', private.preferred_channel(v_customer), v_customer.locale, now());
    end if;
  end if;
  return null;
end;
$$;

drop trigger appointments_enqueue_notifications on public.appointments;
create trigger appointments_enqueue_notifications
  after insert or update of status, starts_at, professional_id on public.appointments
  for each row execute function private.enqueue_notifications();

-- ─── Mover una cita ────────────────────────────────────────────────────────
-- Reglas:
--  · Solo citas reservadas que todavía no empezaron, y siempre hacia el futuro.
--  · Dueño/administrador del salón: todo. El profesional: solo la hora, el día y la duración de SUS citas
--    (cambiar a otro profesional lo hace el dueño o el administrador).
--  · Reserva con varios servicios: si no cambia ni el profesional ni la duración, se mueve la reserva
--    entera (conserva el orden y los tiempos entre servicios). Si cambia alguno, se modifica solo esa cita.
--  · Alargar o acortar no cambia el precio ni el tiempo entre servicios de la cita.
create or replace function public.staff_move_appointment(
  p_appointment_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_duration_min integer default null,
  p_notify boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_salon public.salons;
  v_manager boolean;
  v_pro uuid;
  v_old_dur integer;
  v_dur integer;
  v_booked integer;
  v_first timestamptz;
  v_end timestamptz;
  v_blocked timestamptz;
  v_group_moved boolean := false;
begin
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_manager := private.has_salon_role(v_a.salon_id, '{owner,admin}');
  if not (v_manager or v_a.professional_id in (select private.my_professional_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_a.status <> 'booked' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_a.starts_at <= now() then
    raise exception 'already_started' using errcode = 'P0001';
  end if;
  if p_starts_at is null or p_starts_at < now() then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;

  v_pro := coalesce(p_professional_id, v_a.professional_id);
  if v_pro <> v_a.professional_id then
    if not v_manager then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not exists (select 1 from public.professionals p where p.id = v_pro and p.salon_id = v_a.salon_id and p.is_active) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  v_old_dur := round(extract(epoch from (v_a.ends_at - v_a.starts_at)) / 60)::integer;
  v_dur := coalesce(p_duration_min, v_old_dur);
  if v_dur not between 5 and 480 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  select * into v_salon from public.salons where id = v_a.salon_id;
  if not coalesce(p_notify, true) then
    perform set_config('breeze.skip_move_notice', 'on', true);
  end if;

  select count(*), min(starts_at) into v_booked, v_first
    from public.appointments where booking_group_id = v_a.booking_group_id and status = 'booked';

  if v_pro = v_a.professional_id and v_dur = v_old_dur and v_booked > 1 then
    perform private.reschedule_group(v_a.booking_group_id, v_first + (p_starts_at - v_a.starts_at), false);
    v_group_moved := true;
  else
    if v_pro <> v_a.professional_id and v_a.service_id is not null and not exists (
      select 1 from public.professional_services ps where ps.professional_id = v_pro and ps.service_id = v_a.service_id
    ) then
      raise exception 'service_not_offered' using errcode = 'P0001';
    end if;
    v_end := p_starts_at + make_interval(mins => v_dur);
    v_blocked := v_end + (v_a.blocked_until - v_a.ends_at);
    if not private.fits_schedule(v_pro, v_a.salon_id, v_salon.timezone, p_starts_at, v_blocked) then
      raise exception 'outside_working_hours' using errcode = 'P0001';
    end if;
    update public.appointments
       set professional_id = v_pro, starts_at = p_starts_at, ends_at = v_end, blocked_until = v_blocked
     where id = v_a.id;
  end if;

  perform set_config('breeze.skip_move_notice', '', true);
  return jsonb_build_object('group_moved', v_group_moved, 'starts_at', p_starts_at, 'professional_id', v_pro);
end;
$$;

revoke execute on function public.staff_move_appointment(uuid, uuid, timestamptz, integer, boolean) from public, anon;
grant execute on function public.staff_move_appointment(uuid, uuid, timestamptz, integer, boolean) to authenticated;
