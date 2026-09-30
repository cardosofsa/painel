-- ============================================================
-- 0038 — Aba "Vixe" (Fase 7.5). Uma entrada no menu; os segmentos ficam dentro dela.
--
-- A central de alertas só lê dados que a própria conta já tem (RLS de sempre) e esconde o
-- que for de aba não liberada (ex.: fiado sem acesso a Financeiro/Clientes). Por isso ela
-- é liberada para quem já tem conta; contas novas recebem pelo `ABAS_PADRAO` do app.
--
-- Idempotente: só acrescenta onde ainda não existe.
-- ============================================================

update perfis_acesso
   set abas = array_append(abas, 'vixe')
 where not ('vixe' = any (abas));

NOTIFY pgrst, 'reload schema';
