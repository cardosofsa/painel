-- ============================================================
-- 0048 — Sincronização automática da Shopee a cada 15 minutos (Fase 9.6).
--
-- O agendador do próprio Supabase (pg_cron) chama a rota /api/cron/shopee do sistema
-- (pg_net). A URL e o CRON_SECRET ficam no cofre do Supabase (Vault) — NUNCA neste
-- arquivo. Antes de rodar esta migração, crie os dois segredos UMA vez no SQL Editor:
--
--   select vault.create_secret('https://SEU-DOMINIO/api/cron/shopee', 'sertao_cron_url');
--   select vault.create_secret('O-MESMO-CRON_SECRET-DA-VERCEL', 'sertao_cron_secret');
--
-- (Para trocar depois: select vault.update_secret(id, 'novo valor') com o id de
--  select id, name from vault.secrets;)
--
-- Sem os segredos, o job roda e não faz nada (a rota responde 401/204). Sem pg_cron ou
-- pg_net disponíveis no plano, habilite em Database → Extensions e rode de novo.
--
-- Idempotente: reagendar com o mesmo nome substitui o job.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sertao-shopee-sincronizar',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sertao_cron_url' limit 1),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'sertao_cron_secret' limit 1), '')
    ),
    timeout_milliseconds := 55000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'sertao_cron_url');
  $job$
);

NOTIFY pgrst, 'reload schema';
