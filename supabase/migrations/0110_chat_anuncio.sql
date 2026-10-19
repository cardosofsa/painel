-- ============================================================
-- 0110 — Chat do Anúncio Infinito: ações aplicadas, anexos e exemplos colados.
--
-- Por quê: a conversa do anúncio (0099) vira um chat ao lado da tela de criação, onde o
-- vendedor também cola textos e manda imagens de referência. Três coisas mudam:
--
--   anuncio_rascunho_mensagens.acoes_feitas  índices das ações da mensagem que o vendedor já
--                                            aplicou. Antes o "Feito" morava só na tela:
--                                            recarregar mostrava o botão de novo e dava para
--                                            aplicar duas vezes.
--   anuncio_rascunho_mensagens.anexos        o que veio junto da mensagem: texto de referência
--                                            colado ({tipo:'texto', qual, de_outra_loja, texto})
--                                            e imagens ({tipo:'imagem', path}).
--   marca_exemplos.origem                    passa a aceitar 'referencia': texto que o vendedor
--                                            colou no chat e mandou guardar como exemplo.
--
-- O teto de `acoes` sobe de 8.000 para 16.000 caracteres: uma ação "guardar como exemplo"
-- carrega a descrição colada inteira.
--
-- RLS: as duas tabelas já têm policy `for all` com conta_ativa() e with check (0099 e 0109);
-- nada muda nelas. O código no ar continua funcionando antes e depois: só acrescenta colunas
-- com default e afrouxa checks. Nenhum dado existente é alterado.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table anuncio_rascunho_mensagens add column if not exists acoes_feitas int[] not null default '{}';
alter table anuncio_rascunho_mensagens add column if not exists anexos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'anuncio_rascunho_mensagens_acoes_feitas_check') then
    alter table anuncio_rascunho_mensagens add constraint anuncio_rascunho_mensagens_acoes_feitas_check
      check (cardinality(acoes_feitas) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anuncio_rascunho_mensagens_anexos_check') then
    alter table anuncio_rascunho_mensagens add constraint anuncio_rascunho_mensagens_anexos_check
      check (jsonb_typeof(anexos) = 'array' and jsonb_array_length(anexos) <= 5 and length(anexos::text) <= 8000);
  end if;
end $$;

alter table anuncio_rascunho_mensagens drop constraint if exists anuncio_rascunho_mensagens_acoes_check;
alter table anuncio_rascunho_mensagens add constraint anuncio_rascunho_mensagens_acoes_check
  check (jsonb_typeof(acoes) = 'array' and length(acoes::text) <= 16000);

alter table marca_exemplos drop constraint if exists marca_exemplos_origem_check;
alter table marca_exemplos add constraint marca_exemplos_origem_check
  check (origem in ('edicao', 'loja', 'referencia'));

NOTIFY pgrst, 'reload schema';
