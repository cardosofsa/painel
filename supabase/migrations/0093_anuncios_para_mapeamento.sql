-- ============================================================
-- 0093 — Dados do anúncio para a tela "Mapeamento de Anúncio" (Produtos).
--
-- Por quê: a tela lista cada anúncio/variação das lojas conectadas com foto, título, variante e
-- SKU, e deixa o dono vincular a um produto. `marketplace_anuncios` (0049) só guardava `sku`
-- (o do pai quando a variação não tem) e `nome` (título + variação juntos). Para gravar o
-- vínculo com a MESMA chave que os pedidos usam (`chave_item_marketplace`, 0084) é preciso o
-- SKU real da variação, o do anúncio pai, o título sem a variação e a variação.
--
-- Só colunas novas e opcionais: sem tabela, sem mudança de RLS. Ficam vazias até a próxima
-- "Detectar anúncios"/sincronização. Idempotente. Termina com NOTIFY.
-- ============================================================

alter table marketplace_anuncios add column if not exists imagem_url   text;
alter table marketplace_anuncios add column if not exists link         text;
alter table marketplace_anuncios add column if not exists sku_modelo   text;
alter table marketplace_anuncios add column if not exists sku_principal text;
alter table marketplace_anuncios add column if not exists variacao     text;
alter table marketplace_anuncios add column if not exists nome_item    text;

-- Listagem por loja e filtro mapeado/não mapeado.
create index if not exists marketplace_anuncios_loja_produto_idx on marketplace_anuncios (loja_id, (produto_id is null));

NOTIFY pgrst, 'reload schema';
