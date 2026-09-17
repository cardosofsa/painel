-- Painel — schema inicial
-- Todas as tabelas restritas ao próprio usuário via RLS (auth.uid() = user_id).

create extension if not exists "pgcrypto";

-- ============================================================
-- Tabelas de apoio / cadastro
-- ============================================================

create table categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  cnpj text,
  contato text,
  telefone text,
  cidade text,
  prazo text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  criado_em timestamptz not null default now()
);

create table canais_venda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  plataforma text,
  comissao_pct numeric not null default 0,
  taxa_fixa numeric not null default 0,
  ciclo text,
  criado_em timestamptz not null default now()
);

create table contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  saldo numeric not null default 0,
  detalhe text,
  criado_em timestamptz not null default now()
);

create table armazens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  endereco text,
  lojas_abastecidas text[] not null default '{}',
  criado_em timestamptz not null default now()
);

-- ============================================================
-- Produtos
-- ============================================================

create table produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  sku text not null,
  nome text not null,
  categoria_id uuid references categorias(id) on delete set null,
  fornecedor_id uuid references fornecedores(id) on delete set null,
  armazem_id uuid references armazens(id) on delete set null,
  custo numeric not null default 0,
  preco_venda numeric not null default 0,
  preco_atacado numeric,
  codigo_barras text,
  imagem_url text,
  estoque integer not null default 0,
  estoque_minimo integer not null default 0,
  saida_media_semanal numeric not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (user_id, sku)
);

create index produtos_user_id_idx on produtos (user_id);

-- ============================================================
-- Precificação (histórico)
-- ============================================================

create table precificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  canal text,
  custo numeric not null,
  taxa_variavel_pct numeric not null default 0,
  taxa_fixa numeric not null default 0,
  taxa_adicional_pct numeric not null default 0,
  imposto_pct numeric not null default 0,
  margem_pct numeric,
  preco_calculado numeric not null,
  lucro numeric not null,
  criado_em timestamptz not null default now()
);

create index precificacoes_user_id_idx on precificacoes (user_id);

-- ============================================================
-- Compras
-- ============================================================

create table pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  numero text not null,
  fornecedor_id uuid references fornecedores(id) on delete set null,
  loja text,
  nf text,
  valor_total numeric not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'recebido')),
  data_pedido date not null default current_date,
  data_recebimento date,
  criado_em timestamptz not null default now(),
  unique (user_id, numero)
);

create table pedidos_compra_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_compra_id uuid not null references pedidos_compra(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  quantidade integer not null,
  custo_unitario numeric not null
);

create index pedidos_compra_user_id_idx on pedidos_compra (user_id);
create index pedidos_compra_itens_pedido_id_idx on pedidos_compra_itens (pedido_compra_id);

-- ============================================================
-- Estoque
-- ============================================================

create table estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  quantidade integer not null,
  motivo text,
  data_movimentacao timestamptz not null default now()
);

create index estoque_movimentacoes_user_id_idx on estoque_movimentacoes (user_id);
create index estoque_movimentacoes_produto_id_idx on estoque_movimentacoes (produto_id);

-- ============================================================
-- Financeiro
-- ============================================================

create table despesas_fixas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  metodo text,
  valor numeric not null,
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  recorrencia text not null default 'mensal',
  conta_id uuid references contas(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric not null,
  descricao text not null,
  origem text,
  categoria text,
  conta_id uuid references contas(id) on delete set null,
  afeta_lucro boolean not null default true,
  data_movimentacao date not null default current_date,
  referencia_pedido_compra_id uuid references pedidos_compra(id) on delete set null,
  referencia_despesa_fixa_id uuid references despesas_fixas(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table contas_a_pagar_receber (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  descricao text not null,
  valor numeric not null,
  data_vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'recebido')),
  conta_id uuid references contas(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index movimentacoes_financeiras_user_id_idx on movimentacoes_financeiras (user_id);
create index contas_a_pagar_receber_user_id_idx on contas_a_pagar_receber (user_id);

-- ============================================================
-- Row Level Security — cada usuário só acessa suas próprias linhas
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'categorias', 'fornecedores', 'canais_venda', 'contas', 'armazens',
      'produtos', 'precificacoes', 'pedidos_compra', 'estoque_movimentacoes',
      'despesas_fixas', 'movimentacoes_financeiras', 'contas_a_pagar_receber'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own_rows_%1$s" on %1$I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- pedidos_compra_itens não tem user_id direto — herda a visibilidade do pedido pai.
alter table pedidos_compra_itens enable row level security;
create policy "own_rows_pedidos_compra_itens" on pedidos_compra_itens for all
  using (exists (select 1 from pedidos_compra p where p.id = pedido_compra_id and p.user_id = auth.uid()))
  with check (exists (select 1 from pedidos_compra p where p.id = pedido_compra_id and p.user_id = auth.uid()));

-- ============================================================
-- Função: marcar pedido de compra como recebido
-- Atualiza status/data, dá entrada no estoque de cada item e registra a movimentação — tudo em uma transação.
-- ============================================================

create or replace function marcar_pedido_recebido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  item record;
begin
  update pedidos_compra
  set status = 'recebido', data_recebimento = current_date
  where id = p_pedido_id and user_id = auth.uid() and status = 'pendente';

  if not found then
    raise exception 'Pedido não encontrado, já recebido ou não pertence ao usuário atual';
  end if;

  for item in
    select * from pedidos_compra_itens where pedido_compra_id = p_pedido_id
  loop
    if item.produto_id is not null then
      update produtos set estoque = estoque + item.quantidade
      where id = item.produto_id and user_id = auth.uid();
    end if;

    insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
    values (auth.uid(), item.produto_id, item.produto_nome, 'entrada', item.quantidade, 'Pedido de compra recebido', now());
  end loop;
end;
$$;
