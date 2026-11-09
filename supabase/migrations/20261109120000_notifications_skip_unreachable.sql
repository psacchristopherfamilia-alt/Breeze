-- Un mensaje que no tiene por dónde salir (el cliente no dejó correo y no hay SMS/WhatsApp activados)
-- no es un fallo: se marca «omitido» al instante, sin reintentos ni ruido en las métricas de fallos.
-- El worker avisa con el error 'no_channel_available' cuando ningún proveedor llega al cliente.
create or replace function public.complete_notification_job(
  p_job_id uuid,
  p_ok boolean,
  p_channel public.notification_channel default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns public.notification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_jobs;
begin
  select * into v_job from public.notification_jobs where id = p_job_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_ok then
    update public.notification_jobs
       set status = 'sent', sent_at = now(), channel = coalesce(p_channel, channel), provider = p_provider,
           provider_message_id = p_provider_message_id, error = null, link_token = null, locked_until = null
     where id = p_job_id;
    return 'sent';
  end if;
  if p_error = 'no_channel_available' then
    update public.notification_jobs
       set status = 'skipped', error = 'no_channel_available', link_token = null, locked_until = null
     where id = p_job_id;
    return 'skipped';
  end if;
  if v_job.attempts >= 3 then
    update public.notification_jobs
       set status = 'failed', error = left(p_error, 500), link_token = null, locked_until = null, provider = p_provider
     where id = p_job_id;
    return 'failed';
  end if;
  update public.notification_jobs
     set error = left(p_error, 500), provider = p_provider,
         locked_until = now() + make_interval(mins => 5 * v_job.attempts) -- reintento: 5, 10 min…
   where id = p_job_id;
  return 'pending';
end;
$$;

revoke execute on function public.complete_notification_job(uuid, boolean, public.notification_channel, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_notification_job(uuid, boolean, public.notification_channel, text, text, text) to service_role;
