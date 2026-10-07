-- ============================================================
-- 0084 — Produto PAI com VARIAÇÕES filhas (kit 1, kit 2, kit 12...).
--
-- O pai tem o estoque físico (ex.: 200 un.). Cada variação filha é um produto com
-- `produto_pai_id` e `quantidade_por_unidade` (N): vender 1 un. do filho baixa N do pai.
--
-- O filho É um kit de um componente só (o pai × N), e por isso reaproveita o motor da 0058
-- inteiro, sem duplicar estoque:
--   * estoque do filho = floor(disponível do pai / N), recalculado sozinho
--     (`recalcular_kits`, `kits_apos_componente`, `kits_apos_reserva`);
--   * venda / baixa / estorno / cancelamento do filho passa N × qtd para o pai
--     (`propagar_estoque_kit`), em qualquer caminho: PDV, esteira, marketplace;
--   * reserva do filho vira reserva do pai (`expandir_reserva_kit`);
--   * filho não ocupa armazém (o saldo é do pai).
--
-- O que esta migração acrescenta:
--   * colunas `produto_pai_id`, `quantidade_por_unidade` e `custo_manual`;
--   * `variacao_preparar` (BEFORE): valida o pai (mesma conta, não é filho nem kit), força
--     `e_kit` e monta `insumos` = [pai × N]; herda nome, categoria e foto do pai;
--   * `zz_variacao_custo` (BEFORE, nome começa com zz para rodar DEPOIS do
--     `trg_recalcular_custo_produto` da 0029, que não é alterado): custo do filho =
--     `custo_manual` (override) ou custo do pai × N;
--   * `variacao_apos_pai` (AFTER): mudou nome/categoria/foto/custo do pai → filhos
--     acompanham; `variacao_apos_mudar` (AFTER): mudou N → recalcula o estoque do filho;
--   * `salvar_variacoes_produto(pai, jsonb)`: grava a lista de variações de uma vez
--     (security invoker: o RLS de `produtos` é a trava);
--   * filho NÃO aparece na vitrine pública (`obter_catalogo_publico`,
--     `compre_junto_publico`) e não entra em pedido da vitrine (trigger em
--     `pedidos_vitrine_itens`);
--   * vínculo de anúncio da Shopee por VARIAÇÃO sem SKU próprio:
--     `chave_item_marketplace(sku, sku_principal, nome, variacao)` (a mesma regra de
--     `skuExterno()` em lib/marketplace/margem.ts) e `revincular_itens_marketplace` casa
--     também por essa chave.
--
-- Não mexe em `custo_de_insumos` nem no trigger de custo da 0029.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table produtos add column if not exists produto_pai_id uuid references produtos(id) on delete cascade;
alter table produtos add column if not exists quantidade_por_unidade integer;
alter table produtos add column if not exists custo_manual numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_quantidade_por_unidade_check') then
    alter table produtos add constraint produtos_quantidade_por_unidade_check
      check (quantidade_por_unidade is null or (quantidade_por_unidade >= 1 and quantidade_por_unidade <= 100000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produtos_custo_manual_check') then
    alter table produtos add constraint produtos_custo_manual_check check (custo_manual is null or custo_manual >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produtos_variacao_tem_n_check') then
    alter table produtos add constraint produtos_variacao_tem_n_check
      check (produto_pai_id is null or quantidade_por_unidade is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produtos_variacao_nao_e_ela_check') then
    alter table produtos add constraint produtos_variacao_nao_e_ela_check check (produto_pai_id is null or produto_pai_id <> id);
  end if;
end $$;

create index if not exists produtos_produto_pai_idx on produtos (produto_pai_id) where produto_pai_id is not null;

-- ------------------------------------------------------------
-- Antes de gravar: valida o pai e monta o filho como kit de 1 componente.
-- `security definer` para enxergar o pai mesmo no meio de outra RPC; a conta é conferida
-- à mão (pai precisa ser do mesmo `user_id`).
-- ------------------------------------------------------------
create or replace function variacao_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai produtos%rowtype;
begin
  if new.produto_pai_id is null then
    -- Pai (ou produto comum): não pode virar kit enquanto tiver variações.
    if tg_op = 'UPDATE' and new.e_kit and exists (select 1 from produtos f where f.produto_pai_id = new.id) then
      raise exception 'Este produto tem variações: ele guarda o estoque delas e não pode virar kit.';
    end if;
    -- Variação não vira produto comum (o estoque dela é o do pai): remova e cadastre outro.
    if tg_op = 'UPDATE' and old.produto_pai_id is not null then
      raise exception 'Uma variação não pode virar produto avulso: remova a variação e cadastre o produto.';
    end if;
    return new;
  end if;

  select * into v_pai from produtos where id = new.produto_pai_id and user_id = new.user_id;
  if not found then
    raise exception 'Produto pai não encontrado.';
  end if;
  if v_pai.produto_pai_id is not null then
    raise exception 'Uma variação não pode ter variações: escolha o produto principal.';
  end if;
  if v_pai.e_kit then
    raise exception 'Um kit não pode ser produto pai de variações.';
  end if;
  if exists (select 1 from produtos f where f.produto_pai_id = new.id) then
    raise exception 'Este produto já tem variações e não pode virar variação de outro.';
  end if;

  new.quantidade_por_unidade := greatest(1, coalesce(new.quantidade_por_unidade, 1));
  new.e_kit := true;
  new.grupo_id := null;
  new.custo_base := 0;
  new.insumos := jsonb_build_array(jsonb_build_object(
    'id', 'variacao-pai',
    'nome', v_pai.nome,
    'quantidade', new.quantidade_por_unidade,
    'custoUnitario', coalesce(v_pai.custo, 0),
    'produtoId', v_pai.id::text
  ));
  -- Herda do pai (o filho é só "o pai em pacote de N").
  new.nome := v_pai.nome;
  new.categoria_id := v_pai.categoria_id;
  if new.imagem_url is null then
    new.imagem_url := v_pai.imagem_url;
  end if;
  if coalesce(trim(new.variante_nome), '') = '' then
    new.variante_nome := case when new.quantidade_por_unidade = 1 then '1 un.' else format('Kit %s', new.quantidade_por_unidade) end;
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_variacao_preparar on produtos;
create trigger produtos_variacao_preparar
  before insert or update on produtos
  for each row execute function variacao_preparar();

-- ------------------------------------------------------------
-- Custo do filho: override (`custo_manual`) ou custo do pai × N. Roda depois do trigger
-- de custo da 0029 (ordem alfabética: `zz_` fica por último) e só toca em variação.
-- ------------------------------------------------------------
create or replace function variacao_custo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_custo_pai numeric;
begin
  if new.produto_pai_id is null then
    return new;
  end if;
  if new.custo_manual is not null then
    new.custo := round(new.custo_manual, 2);
  else
    select coalesce(custo, 0) into v_custo_pai from produtos where id = new.produto_pai_id and user_id = new.user_id;
    new.custo := round(coalesce(v_custo_pai, 0) * new.quantidade_por_unidade, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists zz_variacao_custo on produtos;
create trigger zz_variacao_custo
  before insert or update on produtos
  for each row execute function variacao_custo();

-- ------------------------------------------------------------
-- Pai mudou nome/categoria/foto/custo → os filhos acompanham (o BEFORE deles refaz tudo).
-- ------------------------------------------------------------
create or replace function variacao_apos_pai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.produto_pai_id is not null then
    return null;
  end if;
  update produtos f
     set nome = new.nome,
         categoria_id = new.categoria_id,
         imagem_url = case when f.imagem_url is null or f.imagem_url is not distinct from old.imagem_url then new.imagem_url else f.imagem_url end
   where f.produto_pai_id = new.id;
  return null;
end;
$$;

drop trigger if exists produtos_variacao_apos_pai on produtos;
create trigger produtos_variacao_apos_pai
  after update on produtos
  for each row
  when (old.nome is distinct from new.nome
     or old.categoria_id is distinct from new.categoria_id
     or old.imagem_url is distinct from new.imagem_url
     or old.custo is distinct from new.custo)
  execute function variacao_apos_pai();

-- Mudou N (ou virou variação de outro pai) → estoque do filho recalculado. O trigger da 0058
-- só olha `update of insumos, e_kit`, e aqui os insumos mudam dentro do BEFORE.
create or replace function variacao_apos_mudar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.produto_pai_id is not null then
    delete from estoque_armazem where produto_id = new.id;
    perform recalcular_kits(null, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists produtos_variacao_apos_mudar on produtos;
create trigger produtos_variacao_apos_mudar
  after update of produto_pai_id, quantidade_por_unidade on produtos
  for each row
  when (old.produto_pai_id is distinct from new.produto_pai_id or old.quantidade_por_unidade is distinct from new.quantidade_por_unidade)
  execute function variacao_apos_mudar();

-- ------------------------------------------------------------
-- Grava a lista de variações de um pai de uma vez. `p_variacoes`:
--   [{ id?, variante_nome, quantidade, sku, custo_manual?, preco_venda }]
-- Variação do pai que não veio na lista é removida. `security invoker`: o RLS de
-- `produtos` (dono + conta_ativa) segura tudo.
-- ------------------------------------------------------------
create or replace function salvar_variacoes_produto(p_pai uuid, p_variacoes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_pai    produtos%rowtype;
  v_item   jsonb;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_n      integer;
  v_sku    text;
  v_nome   text;
  v_custo  numeric;
  v_preco  numeric;
  v_novos  integer := 0;
  v_atual  integer := 0;
  v_rem    integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  select * into v_pai from produtos where id = p_pai and user_id = v_user;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if v_pai.produto_pai_id is not null then
    raise exception 'Uma variação não pode ter variações: abra o produto principal.';
  end if;
  if v_pai.e_kit then
    raise exception 'Um kit não pode ter variações por quantidade.';
  end if;
  if jsonb_typeof(coalesce(p_variacoes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_variacoes, '[]'::jsonb)) > 50 then
    raise exception 'No máximo 50 variações por produto.';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_variacoes, '[]'::jsonb)) i)
     <> (select count(distinct lower(trim(i->>'variante_nome'))) from jsonb_array_elements(coalesce(p_variacoes, '[]'::jsonb)) i) then
    raise exception 'Duas variações com o mesmo nome.';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_variacoes, '[]'::jsonb)) loop
    v_n := nullif(v_item->>'quantidade', '')::integer;
    v_sku := left(trim(coalesce(v_item->>'sku', '')), 80);
    v_nome := left(trim(coalesce(v_item->>'variante_nome', '')), 80);
    v_custo := nullif(v_item->>'custo_manual', '')::numeric;
    v_preco := coalesce(nullif(v_item->>'preco_venda', '')::numeric, 0);
    if v_n is null or v_n < 1 then
      raise exception 'A quantidade de cada variação precisa ser 1 ou mais.';
    end if;
    if v_sku = '' then
      raise exception 'Informe o SKU de cada variação.';
    end if;
    if v_preco < 0 or (v_custo is not null and v_custo < 0) then
      raise exception 'Custo e preço não podem ser negativos.';
    end if;
    v_id := nullif(v_item->>'id', '')::uuid;

    if v_id is not null then
      update produtos
         set variante_nome = nullif(v_nome, ''),
             quantidade_por_unidade = v_n,
             sku = v_sku,
             custo_manual = v_custo,
             preco_venda = v_preco
       where id = v_id and user_id = v_user and produto_pai_id = p_pai;
      if not found then
        raise exception 'Variação não encontrada (atualize a página).';
      end if;
      v_atual := v_atual + 1;
    else
      insert into produtos (user_id, sku, nome, produto_pai_id, quantidade_por_unidade, variante_nome, custo_manual, preco_venda, estoque, estoque_minimo, ativo, armazem_id)
      values (v_user, v_sku, v_pai.nome, p_pai, v_n, nullif(v_nome, ''), v_custo, v_preco, 0, 0, v_pai.ativo, v_pai.armazem_id)
      returning id into v_id;
      v_novos := v_novos + 1;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  delete from produtos where produto_pai_id = p_pai and user_id = v_user and not (id = any(v_ids));
  get diagnostics v_rem = row_count;

  return jsonb_build_object('novas', v_novos, 'atualizadas', v_atual, 'removidas', v_rem);
end;
$$;

revoke execute on function salvar_variacoes_produto(uuid, jsonb) from public, anon;
grant execute on function salvar_variacoes_produto(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- Vitrine pública: variação filha não aparece (serve para anúncio e baixa do pai).
-- Mesma assinatura e colunas da 0033 (create or replace basta; só ganha o filtro).
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
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0 and p.produto_pai_id is null
  left join produto_grupos g on g.id = p.grupo_id
  left join categorias c on c.id = coalesce(p.categoria_id, g.categoria_id)
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  left join vendidos vs on vs.pid = p.id
  order by c.nome nulls last, coalesce(g.nome, p.nome), p.variante_nome nulls first
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

-- "Compre junto" (0075): igual, só sem variação filha entre os visíveis.
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
    select p.id, p.grupo_id from produtos p where p.user_id = v_dono and p.ativo = true and p.estoque > 0 and p.produto_pai_id is null
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

-- Pedido da vitrine não aceita variação filha (ela não aparece lá; um UUID colado à mão
-- também não passa). Trigger em vez de reescrever `criar_pedido_vitrine`.
create or replace function pedido_vitrine_sem_variacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.produto_id is not null and exists (select 1 from produtos where id = new.produto_id and produto_pai_id is not null) then
    raise exception 'Um ou mais produtos saíram do catálogo. Atualize a página e tente de novo.';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_vitrine_itens_sem_variacao on pedidos_vitrine_itens;
create trigger pedidos_vitrine_itens_sem_variacao
  before insert or update of produto_id on pedidos_vitrine_itens
  for each row execute function pedido_vitrine_sem_variacao();

-- ------------------------------------------------------------
-- Chave do item/anúncio de marketplace que o vínculo manual grava: o SKU da variação; sem
-- ele, "SKU principal (ou nome) · variação"; sem variação, o SKU principal (ou o nome).
-- Igual a `skuExterno()` (lib/marketplace/margem.ts). A variação é normalizada
-- ("Azul,P" do pedido = "Azul · P" do anúncio).
-- ------------------------------------------------------------
create or replace function chave_item_marketplace(p_sku text, p_sku_principal text, p_nome text, p_variacao text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(p_sku), '') is not null then trim(p_sku)
    when nullif(trim(p_variacao), '') is not null then
      coalesce(nullif(trim(p_sku_principal), ''), trim(coalesce(p_nome, ''))) || ' · ' ||
      regexp_replace(trim(p_variacao), '\s*[,·]\s*', ' · ', 'g')
    else coalesce(nullif(trim(p_sku_principal), ''), trim(coalesce(p_nome, '')))
  end;
$$;

grant execute on function chave_item_marketplace(text, text, text, text) to authenticated;

-- revincular_itens_marketplace (0052) + casa também pela chave da variação. Mesma assinatura.
create or replace function revincular_itens_marketplace(p_loja_id uuid, p_sku text, p_produto_id uuid, p_imposto_pct numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_custo   numeric;
  v_loja    text;
  v_armazem uuid;
  v_ped     record;
  v_itens   integer := 0;
  v_pedidos integer := 0;
  v_baixas  integer := 0;
  v_qtd     integer;
  v_chave   text := lower(trim(coalesce(p_sku, '')));
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  select nome into v_loja from lojas_canal where id = p_loja_id and user_id = v_user;
  if v_loja is null then
    raise exception 'Loja não encontrada.';
  end if;
  select custo into v_custo from produtos where id = p_produto_id and user_id = v_user;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if v_chave = '' then
    raise exception 'Informe o SKU do anúncio.';
  end if;

  -- Guarda o vínculo para as próximas importações.
  update marketplace_vinculos set produto_id = p_produto_id
   where user_id = v_user and loja_id = p_loja_id and lower(sku_externo) = v_chave;
  if not found then
    insert into marketplace_vinculos (user_id, loja_id, sku_externo, produto_id) values (v_user, p_loja_id, left(trim(p_sku), 300), p_produto_id);
  end if;

  select id into v_armazem from armazens where user_id = v_user and p_loja_id = any(coalesce(loja_ids, '{}')) order by criado_em limit 1;
  perform set_config('app.armazem_mov', coalesce(v_armazem::text, ''), true);

  for v_ped in
    select distinct p.id, p.numero, p.estoque_baixado, p.estoque_reservado, p.subtotal, p.repasse
      from pedidos_marketplace p
      join pedidos_marketplace_itens i on i.pedido_id = p.id
     where p.user_id = v_user and p.loja_id = p_loja_id and i.produto_id is null
       and v_chave in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')), lower(chave_item_marketplace(i.sku, i.sku_principal, i.nome, i.variacao)))
  loop
    select coalesce(sum(quantidade), 0)::integer into v_qtd
      from pedidos_marketplace_itens i
     where i.pedido_id = v_ped.id and i.produto_id is null
       and v_chave in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')), lower(chave_item_marketplace(i.sku, i.sku_principal, i.nome, i.variacao)));

    update pedidos_marketplace_itens i
       set produto_id = p_produto_id, custo_unitario = v_custo
     where i.pedido_id = v_ped.id and i.produto_id is null
       and v_chave in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')), lower(chave_item_marketplace(i.sku, i.sku_principal, i.nome, i.variacao)));
    get diagnostics v_itens = row_count;

    -- Pedido só reservado → reserva também o item que ganhou produto (variação → pai × N).
    if not v_ped.estoque_baixado and coalesce(v_ped.estoque_reservado, false) and v_qtd > 0 then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, pedido_marketplace_id)
      values (v_user, p_produto_id, v_qtd, 'marketplace', v_ped.id)
      on conflict (pedido_marketplace_id, produto_id) where pedido_marketplace_id is not null
      do update set quantidade = estoque_reservas.quantidade + excluded.quantidade;
    end if;
    -- O pedido já tinha baixado os outros itens: baixa também os que ganharam produto.
    if v_ped.estoque_baixado and v_qtd > 0 then
      perform registrar_movimentacao_estoque(p_produto_id, 'saida', v_qtd, left(format('Venda Shopee %s pedido %s (vínculo)', v_loja, v_ped.numero), 300));
      v_baixas := v_baixas + 1;
    end if;

    update pedidos_marketplace p set
      custo = sub.custo,
      imposto = round(p.subtotal * greatest(0, coalesce(p_imposto_pct, 0)), 2),
      lucro = round(p.repasse - sub.custo - p.subtotal * greatest(0, coalesce(p_imposto_pct, 0)), 2),
      custo_incompleto = sub.faltando > 0,
      atualizado_em = now()
      from (
        select coalesce(sum(case when produto_id is not null then coalesce(custo_unitario, 0) * quantidade else 0 end), 0) as custo,
               count(*) filter (where produto_id is null) as faltando
          from pedidos_marketplace_itens where pedido_id = v_ped.id
      ) sub
     where p.id = v_ped.id and p.status not in ('cancelado', 'devolvido');

    v_pedidos := v_pedidos + 1;
  end loop;

  return jsonb_build_object('pedidos', v_pedidos, 'baixas', v_baixas);
end;
$$;

NOTIFY pgrst, 'reload schema';
