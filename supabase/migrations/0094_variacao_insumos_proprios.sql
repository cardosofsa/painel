-- ============================================================
-- 0094 — Insumos/embalagem PRÓPRIOS de cada variação (kit 2, kit 12...).
--
-- Por quê: a variação por quantidade (0084) é um kit de um componente só (o pai × N), e o
-- trigger `variacao_preparar` sobrescrevia `insumos` com [pai × N] a cada gravação. A embalagem
-- muda de kit para kit (Kit 12 usa caixa maior) e com o tempo, e não havia onde guardar isso:
-- qualquer insumo gravado na variação era apagado em silêncio.
--
-- 1) `produtos.insumos_variacao` (jsonb, mesmo formato dos insumos): a composição EXTRA da
--    variação. `variacao_preparar` monta `insumos = [pai × N] || insumos_variacao`.
-- 2) `variacao_custo`: sem `custo_manual`, custo = custo do pai × N + custo dos extras. Com
--    `custo_manual` o override continua valendo como custo TOTAL (como na 0084).
-- 3) Insumo extra com `produtoId` (uma caixa em estoque) é consumido pelo motor de kit da 0058
--    a cada venda da variação; sem `produtoId` é só custo. `variacao_apos_mudar` passa a
--    disparar também quando `insumos_variacao` muda (o trigger de kits só olha `insumos`, que
--    aqui muda dentro do BEFORE) para recalcular o estoque da variação.
--
-- Validação no banco (não só na tela): array de até 30 itens, quantidade e custo numéricos, e
-- `produtoId` só de produto da MESMA conta, que não seja o pai nem a própria variação (o motor de
-- kit é security definer: sem isso daria para apontar para o estoque de outra conta).
-- Variações existentes ficam com `insumos_variacao = []` e o MESMO custo de hoje. Idempotente.
-- ============================================================

alter table produtos add column if not exists insumos_variacao jsonb not null default '[]'::jsonb;

create or replace function variacao_preparar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai   produtos%rowtype;
  v_item  jsonb;
  v_pid   text;
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

  -- Insumos próprios da variação (embalagem etc.).
  new.insumos_variacao := coalesce(new.insumos_variacao, '[]'::jsonb);
  if jsonb_typeof(new.insumos_variacao) <> 'array' or jsonb_array_length(new.insumos_variacao) > 30 then
    raise exception 'A composição da variação deve ter no máximo 30 itens.';
  end if;
  for v_item in select * from jsonb_array_elements(new.insumos_variacao) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'quantidade', '') !~ '^[0-9]+(\.[0-9]+)?$'
       or coalesce(v_item->>'custoUnitario', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Item inválido na composição da variação: informe quantidade e custo.';
    end if;
    v_pid := nullif(v_item->>'produtoId', '');
    if v_pid is not null then
      if v_pid !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'Item inválido na composição da variação.';
      end if;
      if v_pid::uuid = new.id or v_pid::uuid = v_pai.id then
        raise exception 'A composição da variação não pode usar o próprio produto principal ou a si mesma.';
      end if;
      if not exists (select 1 from produtos x where x.id = v_pid::uuid and x.user_id = new.user_id) then
        raise exception 'Produto da composição não encontrado.';
      end if;
    end if;
  end loop;

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
  )) || new.insumos_variacao;
  -- Herda do pai (o filho é só "o pai em pacote de N", mais a embalagem própria).
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
    new.custo := round(coalesce(v_custo_pai, 0) * new.quantidade_por_unidade + custo_de_insumos(new.insumos_variacao), 2);
  end if;
  return new;
end;
$$;

-- Mudou N, o pai, ou a composição própria → estoque da variação recalculado.
drop trigger if exists produtos_variacao_apos_mudar on produtos;
create trigger produtos_variacao_apos_mudar
  after update of produto_pai_id, quantidade_por_unidade, insumos_variacao on produtos
  for each row
  when (old.produto_pai_id is distinct from new.produto_pai_id
     or old.quantidade_por_unidade is distinct from new.quantidade_por_unidade
     or old.insumos_variacao is distinct from new.insumos_variacao)
  execute function variacao_apos_mudar();

NOTIFY pgrst, 'reload schema';
