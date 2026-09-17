-- Painel — Precificação: título do anúncio persistido no histórico.

alter table precificacoes
  add column if not exists titulo_anuncio text;

NOTIFY pgrst, 'reload schema';
