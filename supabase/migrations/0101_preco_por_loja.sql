-- ============================================================
-- 0101 — Preço por loja.
--
-- Por quê: o produto tinha um preço só (`produtos.preco_venda`), e era ele que o Anúncio
-- mandava para a Shopee, mesmo quando a precificação daquela loja dava outro valor. Agora
-- cada loja tem o próprio preço, guardado na linha que já liga produto e loja
-- (`produto_lojas`, 0013, com `unique (produto_id, loja_id)`):
--
--   preco                 o preço de venda NAQUELA loja (nulo = ainda não precificado)
--   precificacao_id       a precificação que deu esse preço (some se ela for apagada)
--   preco_atualizado_em   quando o preço mudou pela última vez
--
-- `produtos.preco_venda` continua existindo e passa a ser só o preço do PDV, do balcão e
-- do catálogo. Nada é removido: o código no ar continua funcionando antes e depois.
--
-- A cópia do histórico (preencher `preco` com a última precificação de cada loja) NÃO está
-- aqui: é escrita em dado real e fica em scripts/supabase/copiar-precos-historico.sql,
-- para rodar só se o dono quiser.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table produto_lojas add column if not exists preco numeric(12,2);
alter table produto_lojas add column if not exists precificacao_id uuid references precificacoes(id) on delete set null;
alter table produto_lojas add column if not exists preco_atualizado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produto_lojas_preco_check') then
    alter table produto_lojas add constraint produto_lojas_preco_check check (preco is null or (preco > 0 and preco <= 10000000));
  end if;
end $$;

-- A precificação ligada precisa ser da mesma conta (mesmo padrão da 0026).
drop trigger if exists trg_valida_vinculo_produto_lojas_precificacao on produto_lojas;
create trigger trg_valida_vinculo_produto_lojas_precificacao
before insert or update of precificacao_id on produto_lojas
for each row execute function validar_vinculo_do_dono('precificacao_id', 'precificacoes');

create index if not exists produto_lojas_precificacao_idx on produto_lojas (precificacao_id);

NOTIFY pgrst, 'reload schema';
