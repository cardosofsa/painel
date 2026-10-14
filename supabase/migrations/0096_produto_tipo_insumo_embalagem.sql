-- ============================================================
-- 0096 — Insumo e embalagem como TIPO do produto, fora de tudo que é vendido.
--
-- Por quê: o "tipo" insumo/embalagem existia só na categoria (0042) e só agrupava o seletor da
-- composição de custo. Insumo e embalagem apareciam na lista de Produtos, no PDV, na busca e na
-- vitrine pública (preço 0 = "Consultar"). Agora o produto tem `tipo`: 'produto' (mercadoria,
-- o que se vende), 'insumo' ou 'embalagem'.
--
-- 1) `produtos.tipo` (padrão 'produto'). Quem hoje está numa categoria do tipo insumo/embalagem
--    migra sozinho (decisão do dono); dá para corrigir um a um.
-- 2) A exposição PÚBLICA é fechada no banco, não só na tela: `obter_catalogo_publico` e
--    `compre_junto_publico` só enxergam `tipo = 'produto'` (copiadas da 0084, mudando só esse
--    filtro), e o trigger do pedido da vitrine recusa item que não seja mercadoria (um UUID
--    colado à mão também não passa).
-- O que NÃO muda: estoque, compras, inventário e alertas continuam vendo insumo e embalagem
-- (eles se compram e se contam).
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table produtos add column if not exists tipo text not null default 'produto';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_tipo_check') then
    alter table produtos add constraint produtos_tipo_check check (tipo in ('produto', 'insumo', 'embalagem'));
  end if;
end $$;
create index if not exists produtos_tipo_idx on produtos (user_id, tipo) where tipo <> 'produto';

-- Quem já está numa categoria de insumo/embalagem vira insumo/embalagem.
update produtos p
   set tipo = c.tipo
  from categorias c
 where c.id = p.categoria_id
   and c.tipo in ('insumo', 'embalagem')
   and p.tipo = 'produto'
   and p.produto_pai_id is null;

-- ------------------------------------------------------------
-- Vitrine pública: só mercadoria. (Igual à 0084, com `and p.tipo = 'produto'`.)
-- ------------------------------------------------------------
create or replace function obter_catalogo_publico(p_slug text)
returns table (
  catalogo_nome text,
  produto_id uuid,
  produto_nome text,
  grupo_id uuid,
  grupo_nome text,
  variante_nome text,
  descricao text,
  imagem_url text,
  categoria_nome text,
  preco numeric,
  imagens_extra text[],
  negocio_whatsapp text,
  ordem_popularidade integer,
  catalogo_tipo_preco text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
  v_whatsapp text;
begin
  select c.id, c.user_id, c.nome, c.tipo_preco
    into v_catalogo
    from catalogos c
   where c.slug = p_slug and c.ativo = true;

  if not found then
    return;
  end if;

  -- Conta pendente, suspensa ou vencida: a vitrine responde como se o link não existisse.
  if not conta_ativa_de(v_catalogo.user_id) then
    return;
  end if;

  select pn.whatsapp into v_whatsapp from perfil_negocio pn where pn.user_id = v_catalogo.user_id;

  return query
  with vendidos as (
    select vi.produto_id as pid, sum(vi.quantidade) as qtd
      from venda_itens vi
      join vendas vd on vd.id = vi.venda_id
     where vd.user_id = v_catalogo.user_id
       and vd.status <> 'cancelada'
       and vd.data_venda >= now() - interval '90 days'
     group by vi.produto_id
  )
  select
    v_catalogo.nome,
    p.id,
    coalesce(g.nome, p.nome),
    p.grupo_id,
    g.nome,
    p.variante_nome,
    coalesce(p.descricao, g.descricao),
    coalesce(p.imagem_url, g.imagem_url),
    c.nome,
    -- Preço efetivo. null (ou 0) = "Consultar".
    nullif(
      coalesce(cp.preco, case when v_catalogo.tipo_preco = 'atacado' then p.preco_atacado else p.preco_venda end),
      0
    ),
    coalesce(
      (select array_agg(pi.url order by pi.ordem) from produto_imagens pi where pi.produto_id = p.id),
      array[]::text[]
    ),
    v_whatsapp,
    -- Posição (1 = mais vendido nos últimos 90 dias), nunca a quantidade.
    case
      when p.id is null then null
      else (row_number() over (order by coalesce(vs.qtd, 0) desc, coalesce(g.nome, p.nome), p.variante_nome nulls first))::integer
    end,
    v_catalogo.tipo_preco
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0 and p.produto_pai_id is null and p.tipo = 'produto'
  left join produto_grupos g on g.id = p.grupo_id
  left join categorias c on c.id = coalesce(p.categoria_id, g.categoria_id)
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  left join vendidos vs on vs.pid = p.id
  order by c.nome nulls last, coalesce(g.nome, p.nome), p.variante_nome nulls first
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

-- "Compre junto" (0075): só mercadoria entre os visíveis.
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
    select p.id, p.grupo_id from produtos p where p.user_id = v_dono and p.ativo = true and p.estoque > 0 and p.produto_pai_id is null and p.tipo = 'produto'
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

-- Pedido da vitrine só aceita mercadoria (variação filha e insumo/embalagem não aparecem lá).
create or replace function pedido_vitrine_sem_variacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.produto_id is not null and exists (select 1 from produtos where id = new.produto_id and (produto_pai_id is not null or tipo <> 'produto')) then
    raise exception 'Um ou mais produtos saíram do catálogo. Atualize a página e tente de novo.';
  end if;
  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';
