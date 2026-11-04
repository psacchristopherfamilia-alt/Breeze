-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · 011 · Pasar las citas de invitado a una cuenta de cliente
--   Un turista reserva sin cuenta y el navegador guarda el enlace privado (token) de cada cita.
--   Si luego crea una cuenta, estas citas se añaden a ella. Quien tiene el token es quien reservó:
--   por eso el token basta (no se usa la IP ni el teléfono para "adivinar" de quién es una cita).
-- ════════════════════════════════════════════════════════════════════════════

-- Devuelve un estado por token, en el mismo orden que p_tokens:
--   'claimed'   → la cita (y las demás del mismo invitado en esa organización) pasa a tu cuenta
--   'already'   → ya era tuya
--   'not_found' → token inválido, o la cita pertenece a otra cuenta (no se distingue, para no dar pistas)
--   'failed'    → no se pudo unir (p. ej. choca con otra cita tuya a la misma hora); no se cambia nada
create or replace function public.claim_guest_bookings(p_tokens text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_out text[] := '{}';
  v_token text;
  v_group public.booking_groups;
  v_guest public.customers;
  v_mine public.customers;
  v_moved integer;
begin
  -- Las sesiones anónimas (las TV de Breeze Live) no tienen cuenta de cliente.
  if v_user is null or private.is_anonymous_user(v_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_tokens is null or cardinality(p_tokens) > 20 then
    raise exception 'invalid_tokens' using errcode = '22023';
  end if;

  foreach v_token in array p_tokens loop
    begin
      if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
        v_out := array_append(v_out, 'not_found');
        continue;
      end if;
      select * into v_group from public.booking_groups where id = private.group_by_token(v_token);
      if not found then
        v_out := array_append(v_out, 'not_found');
        continue;
      end if;
      select * into v_guest from public.customers where id = v_group.customer_id;
      if v_guest.user_id = v_user then
        v_out := array_append(v_out, 'already');
        continue;
      elsif v_guest.user_id is not null then
        v_out := array_append(v_out, 'not_found');
        continue;
      end if;

      select * into v_mine from public.customers
       where organization_id = v_group.organization_id and user_id = v_user;
      if not found then
        -- Primera vez en este negocio: la ficha de invitado pasa a ser la tuya.
        update public.customers set user_id = v_user where id = v_guest.id;
      else
        -- Ya tienes ficha aquí: se mueven reservas y citas a ella en UNA sola sentencia
        -- (las claves foráneas compuestas se comprueban al final de la sentencia).
        with g as (update public.booking_groups set customer_id = v_mine.id where customer_id = v_guest.id returning 1),
             a as (update public.appointments set customer_id = v_mine.id where customer_id = v_guest.id returning 1)
        select (select count(*) from g) + (select count(*) from a) into v_moved;
        delete from public.customers where id = v_guest.id;
      end if;
      v_out := array_append(v_out, 'claimed');
    exception when others then
      -- Se deshace solo esta vuelta del bucle; las demás siguen.
      v_out := array_append(v_out, 'failed');
    end;
  end loop;
  return v_out;
end;
$$;

revoke execute on function public.claim_guest_bookings(text[]) from public, anon;
grant execute on function public.claim_guest_bookings(text[]) to authenticated;
