-- ════════════════════════════════════════════════════════════════════════════
-- Breeze · Programar el worker de recordatorios cada 5 minutos (pg_cron + pg_net)
-- NO es una migración: se ejecuta UNA vez en el SQL Editor del proyecto `breeze`,
-- porque usa la URL pública de la app y un secreto (que nunca van en el repositorio).
--
-- Alternativa: el cron del hosting (p. ej. Vercel Cron) llamando a
--   GET https://<tu-dominio>/api/cron/notifications  con  Authorization: Bearer <CRON_SECRET>
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Guarda la URL y el secreto en Vault (cambia los valores):
select vault.create_secret('https://TU-DOMINIO', 'breeze_app_url');
select vault.create_secret('EL-MISMO-VALOR-QUE-CRON_SECRET', 'breeze_cron_secret');

-- 2) Programa la llamada cada 5 minutos:
select cron.schedule(
  'breeze-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'breeze_app_url') || '/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'breeze_cron_secret'),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- Para pararlo:  select cron.unschedule('breeze-notifications');
