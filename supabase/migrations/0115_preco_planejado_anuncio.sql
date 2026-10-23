-- ============================================================
-- 0115 — Preço planejado por anúncio (cada anúncio/variação da loja).
--
-- Por quê: o dono vende o mesmo produto em vários anúncios da mesma loja e quer um preço
-- diferente em cada um, dentro da faixa de margem do produto (0114). `produto_lojas` (0101)
-- guarda um preço só por produto e loja; o preço de cada anúncio mora aqui:
--
--   marketplace_anuncios.preco_planejado     o preço que o Painel sugeriu/gravou.
--   marketplace_anuncios.margem_planejada    a margem (fração) que deu esse preço.
--   marketplace_anuncios.preco_planejado_em  quando foi gravado.
--
-- O preço na Shopee NÃO muda por aqui. A sincronização faz upsert só das colunas dela, então
-- não apaga estas. Tudo anulável: o código no ar continua funcionando antes e depois.
-- RLS: a policy `dono_marketplace_anuncios` (0049) já cobre as colunas novas.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table marketplace_anuncios add column if not exists preco_planejado    numeric(12,2);
alter table marketplace_anuncios add column if not exists margem_planejada   numeric(5,4);
alter table marketplace_anuncios add column if not exists preco_planejado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_anuncios_preco_planejado_check') then
    alter table marketplace_anuncios add constraint marketplace_anuncios_preco_planejado_check
      check ((preco_planejado is null or preco_planejado > 0)
             and (margem_planejada is null or (margem_planejada > -1 and margem_planejada < 0.9)));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
