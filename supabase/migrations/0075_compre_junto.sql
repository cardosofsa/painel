-- 0075 — "Compre junto" na vitrine (Fase 5, onda B).
--
-- Para cada produto da vitrine, os produtos que mais saíram NO MESMO PEDIDO nos últimos
-- 180 dias (PDV/catálogo e marketplaces). Só produtos que a vitrine mostra (ativos, com
-- estoque) e nunca dois do mesmo grupo (variante de cor não é "compre junto").
--
-- Pública como `obter_catalogo_publico`: security definer, só pelo slug de um catálogo
-- ativo de conta ativa. Devolve a POSIÇÃO (1, 2, 3), nunca a quantidade: quanto você
-- vende não é informação para a concorrência.
--
-- Idempotente: create or replace (função nova, sem DROP necessário).

create or replace function compre_junto_publico(p_slug text)
returns table (produto_id uuid, relacionado_id uuid, posicao integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dono uuid;
begin
  select c.user_id into v_dono from catalogos c where c.slug = p_slug and c.ativo = true;
  if v_dono is null or not conta_ativa_de(v_dono) then
    return;
  end if;

  return query
  with itens as (
    select vi.venda_id::text as pedido, vi.produto_id as pid
      from venda_itens vi
      join vendas vd on vd.id = vi.venda_id
     where vd.user_id = v_dono
       and vd.status <> 'cancelada'
       and vd.data_venda >= now() - interval '180 days'
       and vi.produto_id is not null
    union
    select pi.pedido_id::text, pi.produto_id
      from pedidos_marketplace_itens pi
      join pedidos_marketplace pm on pm.id = pi.pedido_id
     where pm.user_id = v_dono
       and pm.status not in ('cancelado', 'nao_pago', 'devolvido')
       and pm.criado_em_plataforma >= now() - interval '180 days'
       and pi.produto_id is not null
  ),
  visiveis as (
    select p.id, p.grupo_id from produtos p where p.user_id = v_dono and p.ativo = true and p.estoque > 0
  ),
  pares as (
    select a.pid as pid, b.pid as rid, count(*) as vezes
      from itens a
      join itens b on b.pedido = a.pedido and b.pid <> a.pid
      join visiveis va on va.id = a.pid
      join visiveis vb on vb.id = b.pid
     where va.grupo_id is null or vb.grupo_id is null or va.grupo_id <> vb.grupo_id
     group by a.pid, b.pid
  ),
  ranqueados as (
    select pares.pid, pares.rid, (row_number() over (partition by pares.pid order by pares.vezes desc, pares.rid))::integer as pos
      from pares
  )
  select r.pid, r.rid, r.pos from ranqueados r where r.pos <= 4
  limit 2000;
end;
$$;

revoke execute on function compre_junto_publico(text) from public;
grant execute on function compre_junto_publico(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
