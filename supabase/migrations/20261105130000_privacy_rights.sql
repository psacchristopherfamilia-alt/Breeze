-- Derechos de datos del cliente con cuenta: descargar lo que Breeze guarda de él y borrar su cuenta.

-- Todo lo que Breeze guarda de la persona (perfil, fichas por negocio, citas, avisos pendientes de privacidad).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', p.email, 'full_name', p.full_name, 'phone', p.phone,
                                          'locale', p.locale, 'created_at', p.created_at)
                  from public.profiles p where p.id = v_uid),
    'customer_records', coalesce((
      select jsonb_agg(jsonb_build_object('business', o.name, 'first_name', c.first_name, 'last_name', c.last_name,
                                          'phone', c.phone, 'email', c.email, 'locale', c.locale,
                                          'marketing_opt_in', c.marketing_opt_in, 'whatsapp_opt_in', c.whatsapp_opt_in,
                                          'created_at', c.created_at)
                       order by c.created_at)
        from public.customers c join public.organizations o on o.id = c.organization_id
       where c.user_id = v_uid), '[]'::jsonb),
    'bookings', public.my_bookings()
  );
end;
$$;

-- Borra la cuenta. Las citas pasadas se conservan sin datos personales (contabilidad del negocio);
-- las futuras se cancelan. Un dueño de negocio no puede borrarse: primero se cierra el negocio con soporte.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_customers uuid[];
begin
  if v_uid is null or coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations o where o.owner_id = v_uid) then
    raise exception 'owner_cannot_delete' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(c.id), '{}') into v_customers from public.customers c where c.user_id = v_uid;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, cancel_reason = 'account_deleted'
   where customer_id = any (v_customers) and status = 'booked' and starts_at > now();
  -- Sin avisos a una cuenta que ya no existe.
  update public.notification_jobs j set status = 'skipped'
    from public.appointments a
   where j.appointment_id = a.id and a.customer_id = any (v_customers) and j.status = 'pending';
  update public.appointments set customer_display = 'Deleted account' where customer_id = any (v_customers);
  update public.booking_groups set guest_token_hash = null where customer_id = any (v_customers);

  update public.customers
     set first_name = 'Deleted account', last_name = '', phone = '+10000000000', email = null, notes = null,
         marketing_opt_in = false, whatsapp_opt_in = false, user_id = null
   where id = any (v_customers);

  insert into public.audit_log (actor_id, action, entity, entity_id) values (v_uid, 'account.deleted', 'profiles', v_uid);
  -- El perfil y las membresías se borran en cascada.
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
