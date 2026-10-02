-- ============================================================
-- 0056 — Mercado Livre no modelo da Shopee (Fase 10.8).
--
-- As tabelas de marketplace (0046–0054) já servem às duas plataformas:
--   * marketplace_conexoes.plataforma é texto ('shopee' | 'mercadolivre'); shop_id = id do
--     vendedor no ML;
--   * pedidos e itens usam o mesmo formato; a importação (0052) não depende da plataforma;
--   * marketplace_anuncios guarda o id numérico do anúncio (MLB123 → 123).
--
-- O que muda aqui:
--   1. pedidos_marketplace.plataforma passa a vir da conexão da loja (gatilho), sem
--      precisar recriar a RPC de importação; os pedidos existentes são acertados.
--   2. Índice para a notificação do ML achar a conexão pelo id do vendedor.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create or replace function definir_plataforma_pedido_marketplace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.plataforma := coalesce(
    (select c.plataforma from marketplace_conexoes c where c.loja_id = new.loja_id and c.user_id = new.user_id limit 1),
    new.plataforma
  );
  return new;
end;
$$;

drop trigger if exists pedidos_marketplace_plataforma on pedidos_marketplace;
create trigger pedidos_marketplace_plataforma
  before insert on pedidos_marketplace
  for each row execute function definir_plataforma_pedido_marketplace();

update pedidos_marketplace p
   set plataforma = c.plataforma
  from marketplace_conexoes c
 where c.loja_id = p.loja_id and c.user_id = p.user_id and p.plataforma is distinct from c.plataforma;

create index if not exists marketplace_conexoes_plataforma_shop_idx on marketplace_conexoes (plataforma, shop_id);

NOTIFY pgrst, 'reload schema';
