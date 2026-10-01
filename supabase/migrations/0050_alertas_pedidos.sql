-- ============================================================
-- 0050 — Aviso de pedido novo no sininho (Fase 9.8).
--
-- `alertas` (0034, só estoque mínimo) ganha os tipos de pedido novo, um `link` (para onde
-- o aviso leva) e o `canal` (para o ícone da marca):
--   * pedido_catalogo: chegou pela vitrine → "Novo pedido P-0012 · R$ 59,70 · Ana"
--     (no update que grava o total, logo depois da criação).
--   * pedido_marketplace: entrou pedido da Shopee ainda a enviar (pela API ou planilha).
-- Gatilhos `security definer`: o pedido do catálogo é criado pelo comprador anônimo e o
-- da Shopee pelo cron; o aviso vai para o DONO da loja.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table alertas add column if not exists link text;
alter table alertas add column if not exists canal text;

alter table alertas drop constraint if exists alertas_tipo_check;
alter table alertas add constraint alertas_tipo_check check (tipo in ('estoque_minimo', 'pedido_catalogo', 'pedido_marketplace'));

create or replace function alertar_pedido_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- O pedido nasce com total 0 e o total é gravado logo em seguida (criar_pedido_vitrine):
  -- é esse momento que avisa, já com número e valor.
  if not (coalesce(old.total, 0) = 0 and coalesce(new.total, 0) > 0) then
    return new;
  end if;
  insert into alertas (user_id, tipo, mensagem, link, canal)
  values (
    new.user_id,
    'pedido_catalogo',
    left(format('Novo pedido %s do catálogo · %s · %s', new.numero, 'R$ ' || replace(to_char(coalesce(new.total, 0), 'FM999999990.00'), '.', ','), coalesce(nullif(trim(new.cliente_nome), ''), 'cliente')), 300),
    '/vendas?pedido=' || new.numero,
    'Catálogo'
  );
  return new;
end;
$$;

drop trigger if exists trg_alertar_pedido_catalogo on pedidos_vitrine;
create trigger trg_alertar_pedido_catalogo
after update of total on pedidos_vitrine
for each row execute function alertar_pedido_catalogo();

create or replace function alertar_pedido_marketplace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja  text;
  v_canal text;
begin
  -- Só o que pede ação: pedido pago esperando envio. Histórico já enviado/concluído não avisa.
  if new.status <> 'a_enviar' then
    return new;
  end if;
  select l.nome, c.nome into v_loja, v_canal
    from lojas_canal l left join canais c on c.id = l.canal_id
   where l.id = new.loja_id;
  insert into alertas (user_id, tipo, mensagem, link, canal)
  values (
    new.user_id,
    'pedido_marketplace',
    left(format('Novo pedido %s · %s · %s', coalesce(v_canal, 'Shopee'), coalesce(v_loja, 'loja'), new.numero), 300),
    '/vendas',
    coalesce(v_canal, 'Shopee')
  );
  return new;
end;
$$;

drop trigger if exists trg_alertar_pedido_marketplace on pedidos_marketplace;
create trigger trg_alertar_pedido_marketplace
after insert on pedidos_marketplace
for each row execute function alertar_pedido_marketplace();

NOTIFY pgrst, 'reload schema';
