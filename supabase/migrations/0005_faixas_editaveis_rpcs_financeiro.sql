-- Painel — faixas de comissão editáveis, RPCs atômicas do financeiro, trava de concorrência no numero do pedido.

-- ============================================================
-- Faixas de comissão por canal (editável pelo usuário — ex.: tabela oficial da Shopee)
-- ============================================================

create table faixas_comissao_canal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  canal_id uuid not null references canais(id) on delete cascade,
  ordem integer not null default 0,
  preco_min numeric not null default 0,
  preco_max numeric,
  comissao_pct numeric not null default 0,
  tarifa_fixa numeric not null default 0,
  criado_em timestamptz not null default now()
);

alter table faixas_comissao_canal enable row level security;
create policy "own_rows_faixas_comissao_canal" on faixas_comissao_canal for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index faixas_comissao_canal_canal_id_idx on faixas_comissao_canal (canal_id);

-- Seed das 5 faixas oficiais da Shopee para os canais Shopee já existentes.
insert into faixas_comissao_canal (user_id, canal_id, ordem, preco_min, preco_max, comissao_pct, tarifa_fixa)
select c.user_id, c.id, faixa.ordem, faixa.preco_min, faixa.preco_max, faixa.comissao_pct, faixa.tarifa_fixa
from canais c
cross join (values
  (1, 0::numeric, 7.99::numeric, 50::numeric, 0::numeric),
  (2, 8, 79.99, 20, 4),
  (3, 80, 99.99, 14, 16),
  (4, 100, 199.99, 14, 20),
  (5, 200, null, 14, 26)
) as faixa(ordem, preco_min, preco_max, comissao_pct, tarifa_fixa)
where c.tipo_taxa = 'faixas';

-- Atualiza o seed de novos usuários pra já criar as faixas junto com o canal Shopee.
create or replace function seed_canais_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shopee_id uuid;
begin
  insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao)
  values (new.id, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D', 0, 0)
  returning id into v_shopee_id;

  insert into faixas_comissao_canal (user_id, canal_id, ordem, preco_min, preco_max, comissao_pct, tarifa_fixa) values
    (new.id, v_shopee_id, 1, 0, 7.99, 50, 0),
    (new.id, v_shopee_id, 2, 8, 79.99, 20, 4),
    (new.id, v_shopee_id, 3, 80, 99.99, 14, 16),
    (new.id, v_shopee_id, 4, 100, 199.99, 14, 20),
    (new.id, v_shopee_id, 5, 200, null, 14, 26);

  insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao) values
    (new.id, 'Mercado Livre', 'fixo', 'ShoppingCart', '#FFE600', 0, 0),
    (new.id, 'Loja Física', 'fixo', 'Store', '#64748b', 0, 0),
    (new.id, 'Facebook', 'fixo', 'Facebook', '#1877F2', 0, 0);

  return new;
end;
$$;

-- ============================================================
-- RPCs atômicas do Financeiro (lançamento + saldo numa transação só)
-- ============================================================

create or replace function registrar_movimentacao_financeira(
  p_tipo text,
  p_valor numeric,
  p_descricao text,
  p_origem text,
  p_categoria text,
  p_conta_id uuid,
  p_afeta_lucro boolean,
  p_data date,
  p_referencia_despesa_fixa_id uuid default null,
  p_referencia_pedido_compra_id uuid default null
)
returns void
language plpgsql
security invoker
as $$
begin
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimentação inválido: %', p_tipo;
  end if;

  insert into movimentacoes_financeiras (
    user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
    data_movimentacao, referencia_despesa_fixa_id, referencia_pedido_compra_id
  )
  values (
    auth.uid(), p_tipo, p_valor, p_descricao, p_origem, p_categoria, p_conta_id, p_afeta_lucro,
    p_data, p_referencia_despesa_fixa_id, p_referencia_pedido_compra_id
  );

  update contas
  set saldo = saldo + p_valor
  where id = p_conta_id and user_id = auth.uid();

  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;
end;
$$;

create or replace function desfazer_movimentacao_financeira(p_movimentacao_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_valor numeric;
  v_conta_id uuid;
begin
  delete from movimentacoes_financeiras
  where id = p_movimentacao_id and user_id = auth.uid()
  returning valor, conta_id into v_valor, v_conta_id;

  if not found then
    raise exception 'Movimentação não encontrada ou não pertence ao usuário atual';
  end if;

  if v_conta_id is not null then
    update contas set saldo = saldo - v_valor where id = v_conta_id and user_id = auth.uid();
  end if;
end;
$$;

create or replace function quitar_conta_pagar_receber(p_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_tipo text;
  v_valor numeric;
  v_conta_id uuid;
  v_descricao text;
  v_novo_status text;
  v_delta numeric;
begin
  select tipo, valor, conta_id, descricao into v_tipo, v_valor, v_conta_id, v_descricao
  from contas_a_pagar_receber
  where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'Registro não encontrado ou não pertence ao usuário atual';
  end if;

  v_novo_status := case when v_tipo = 'pagar' then 'pago' else 'recebido' end;

  update contas_a_pagar_receber set status = v_novo_status where id = p_id and user_id = auth.uid();

  if v_conta_id is not null then
    v_delta := case when v_tipo = 'pagar' then -v_valor else v_valor end;

    insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
    values (
      auth.uid(),
      case when v_tipo = 'pagar' then 'saida' else 'entrada' end,
      v_delta,
      v_descricao,
      case when v_tipo = 'pagar' then 'Conta a pagar quitada' else 'Conta a receber recebida' end,
      null,
      v_conta_id,
      true,
      current_date
    );

    update contas set saldo = saldo + v_delta where id = v_conta_id and user_id = auth.uid();
  end if;
end;
$$;

-- ============================================================
-- Trava de concorrência na numeração sequencial do pedido (MV-00, MV-01, ...)
-- ============================================================

create or replace function gerar_numero_pedido()
returns trigger
language plpgsql
security invoker
as $$
declare
  n integer;
begin
  if new.numero is null or new.numero = '' then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select count(*) into n from pedidos_compra where user_id = new.user_id;
    new.numero := 'MV-' || lpad(n::text, 2, '0');
  end if;
  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';
