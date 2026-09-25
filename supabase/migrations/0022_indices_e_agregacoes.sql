-- ============================================================
-- Índices que faltavam e agregações que o app fazia em memória.
--
-- Duas famílias de problema, ambas invisíveis hoje (a base é pequena) e ambas com prazo
-- de validade curto conforme o sistema acumula histórico:
--
-- 1) ÍNDICES. Cruzando os `.eq/.order/.gte` reais do código com os índices existentes,
--    faltam compostos nas cinco tabelas que mais crescem, e 17 chaves estrangeiras não têm
--    índice nenhum — o que faz o DELETE do pai virar sequential scan. Remover UMA conta
--    bancária hoje varre `movimentacoes_financeiras`, `contas_a_pagar_receber`,
--    `despesas_fixas` e `vendas` inteiras; o timeout do PostgREST é 8s.
--
-- 2) AGREGAÇÕES. Três telas baixavam tabelas inteiras para calcular somas em JavaScript:
--    /clientes puxava TODAS as vendas já feitas para montar uma coluna "total comprado";
--    /financeiro puxava `pedidos_compra_itens` e `precificacoes` completas para montar um
--    mapa de ~50 entradas; e o card "Saldo Líquido Realizado" somava apenas os 100
--    lançamentos que a tela tinha em mãos — um número errado que parecia certo.
--
-- Somar no banco também corrige a precisão: `numeric` é exato, enquanto o float64 do
-- JavaScript acumula centavos de erro ao longo de centenas de linhas.
--
-- Todos os índices usam CREATE INDEX IF NOT EXISTS: a migração é segura de rodar de novo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Índices compostos para os padrões de consulta reais
-- ------------------------------------------------------------

-- Quatro telas ordenam precificações por criado_em; com só (user_id), um .limit(50) sobre
-- 50.000 linhas ainda lê as 50.000 e faz sort externo.
create index if not exists precificacoes_user_criado_idx on precificacoes (user_id, criado_em desc);

-- Usado na listagem, nos filtros de período e no DELETE em massa de limpar_financeiro.
create index if not exists mov_fin_user_data_idx on movimentacoes_financeiras (user_id, data_movimentacao desc);

-- O dashboard filtra por status e ordena por vencimento; o financeiro filtra por período.
create index if not exists cpr_user_status_venc_idx on contas_a_pagar_receber (user_id, status, data_vencimento);
create index if not exists cpr_user_venc_idx on contas_a_pagar_receber (user_id, data_vencimento);

create index if not exists pedidos_compra_user_data_idx on pedidos_compra (user_id, data_pedido desc);
create index if not exists pedidos_compra_user_status_idx on pedidos_compra (user_id, status);

create index if not exists estoque_mov_user_data_idx on estoque_movimentacoes (user_id, data_movimentacao desc);

-- `.order("nome")` aparece em seis páginas. `clientes` já tinha o equivalente desde a 0018.
create index if not exists produtos_user_nome_idx on produtos (user_id, lower(nome));

-- `anuncios` não tinha nenhum índice além da PK.
create index if not exists anuncios_user_criado_idx on anuncios (user_id, criado_em desc);
create index if not exists anuncios_produto_idx on anuncios (produto_id);
create index if not exists anuncios_loja_idx on anuncios (loja_id);

create index if not exists compromissos_user_data_idx on compromissos (user_id, data);

-- ------------------------------------------------------------
-- 2) FKs sem índice — cada uma tem uma ação de remoção exposta na interface
-- ------------------------------------------------------------

create index if not exists produtos_categoria_idx on produtos (categoria_id);
create index if not exists produtos_fornecedor_idx on produtos (fornecedor_id);
create index if not exists produtos_armazem_idx on produtos (armazem_id);
create index if not exists produto_grupos_categoria_idx on produto_grupos (categoria_id);

create index if not exists precificacoes_produto_idx on precificacoes (produto_id);
create index if not exists pedidos_compra_itens_produto_idx on pedidos_compra_itens (produto_id);
create index if not exists catalogo_precos_produto_idx on catalogo_precos (produto_id);

create index if not exists pedidos_compra_fornecedor_idx on pedidos_compra (fornecedor_id);
create index if not exists pedidos_compra_armazem_idx on pedidos_compra (armazem_id);

-- As quatro que tornam `removerConta` lento hoje.
create index if not exists mov_fin_conta_idx on movimentacoes_financeiras (conta_id);
create index if not exists cpr_conta_idx on contas_a_pagar_receber (conta_id);
create index if not exists despesas_fixas_conta_idx on despesas_fixas (conta_id);
create index if not exists vendas_conta_idx on vendas (conta_id);

create index if not exists mov_fin_ref_pedido_idx on movimentacoes_financeiras (referencia_pedido_compra_id);
create index if not exists mov_fin_ref_despesa_idx on movimentacoes_financeiras (referencia_despesa_fixa_id);
create index if not exists cpr_ref_pedido_idx on contas_a_pagar_receber (referencia_pedido_compra_id);
create index if not exists cpr_cliente_idx on contas_a_pagar_receber (cliente_id);

-- ------------------------------------------------------------
-- 3) Índices redundantes — prefixo de um composto que já existe
--
-- Um índice só em (user_id) não serve para nada quando existe outro em (user_id, X): o
-- Postgres usa o composto nos dois casos. Manter os dois só custa escrita em todo INSERT.
-- ------------------------------------------------------------

drop index if exists produtos_user_id_idx;            -- coberto por unique (user_id, sku)
drop index if exists pedidos_compra_user_id_idx;      -- coberto por unique (user_id, numero)
drop index if exists clientes_user_id_idx;            -- coberto por clientes_nome_idx
drop index if exists vendas_user_id_idx;              -- coberto por vendas_data_venda_idx
drop index if exists precificacoes_user_id_idx;       -- coberto por precificacoes_user_criado_idx
drop index if exists movimentacoes_financeiras_user_id_idx; -- coberto por mov_fin_user_data_idx
drop index if exists contas_a_pagar_receber_user_id_idx;    -- coberto por cpr_user_venc_idx
drop index if exists estoque_movimentacoes_user_id_idx;     -- coberto por estoque_mov_user_data_idx

-- ------------------------------------------------------------
-- 4) resumo_vendas_por_cliente(): substitui o download de `vendas` inteira em /clientes
-- ------------------------------------------------------------

create or replace function resumo_vendas_por_cliente()
returns table (cliente_id uuid, compras bigint, total_comprado numeric)
language sql
security invoker
stable
set search_path = public
as $$
  select v.cliente_id, count(*)::bigint, coalesce(sum(v.total), 0)
    from vendas v
   where v.user_id = auth.uid()
     and v.status <> 'cancelada'
     and v.cliente_id is not null
   group by v.cliente_id;
$$;

grant execute on function resumo_vendas_por_cliente() to authenticated;

-- ------------------------------------------------------------
-- 5) custos_recentes_por_produto(): substitui duas varreduras totais em /financeiro
--
-- A tela baixava `pedidos_compra_itens` e `precificacoes` completas só para montar, em
-- memória, "qual foi o custo mais recente de cada produto". `distinct on` resolve isso em
-- uma passada indexada.
-- ------------------------------------------------------------

create or replace function custos_recentes_por_produto()
returns table (produto_id uuid, produto_nome text, custo_compra numeric, custo_precificacao numeric)
language sql
security invoker
stable
set search_path = public
as $$
  with compras as (
    -- Só pedidos JÁ RECEBIDOS, ordenados pela data de recebimento: é o custo que de fato
    -- entrou no estoque. Mantém a mesma regra que a página aplicava em memória.
    select distinct on (i.produto_id) i.produto_id, i.produto_nome, i.custo_unitario
      from pedidos_compra_itens i
      join pedidos_compra p on p.id = i.pedido_compra_id
     where p.user_id = auth.uid()
       and p.status = 'recebido'
       and p.data_recebimento is not null
       and i.produto_id is not null
     order by i.produto_id, p.data_recebimento desc
  ),
  precos as (
    select distinct on (pr.produto_id) pr.produto_id, pr.custo
      from precificacoes pr
     where pr.user_id = auth.uid() and pr.produto_id is not null
     order by pr.produto_id, pr.criado_em desc
  )
  -- INNER JOIN: a erosão de margem só existe quando há os dois lados (uma compra recebida
  -- e uma precificação para comparar).
  select c.produto_id, c.produto_nome, c.custo_unitario, p.custo
    from compras c
    join precos p on p.produto_id = c.produto_id;
$$;

grant execute on function custos_recentes_por_produto() to authenticated;

-- ------------------------------------------------------------
-- 6) resumo_financeiro(): os totais que o card mostrava errado
--
-- `FinanceiroClient` somava o array de lançamentos que tinha em mãos — e a página busca
-- apenas os 100 mais recentes. Com poucos dados o número batia; ao passar de 100
-- lançamentos ele passaria a mentir silenciosamente, num card apresentado como indicador
-- financeiro e exportado no relatório em CSV.
-- ------------------------------------------------------------

create or replace function resumo_financeiro(p_inicio date default null, p_fim date default null)
returns table (
  total_entradas numeric,
  total_saidas numeric,
  saldo_liquido numeric,
  entradas_com_lucro numeric,
  saidas_com_lucro numeric,
  quantidade bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    coalesce(sum(m.valor) filter (where m.valor > 0), 0),
    coalesce(sum(m.valor) filter (where m.valor < 0), 0),
    coalesce(sum(m.valor), 0),
    coalesce(sum(m.valor) filter (where m.valor > 0 and m.afeta_lucro), 0),
    coalesce(sum(m.valor) filter (where m.valor < 0 and m.afeta_lucro), 0),
    count(*)::bigint
  from movimentacoes_financeiras m
  where m.user_id = auth.uid()
    and (p_inicio is null or m.data_movimentacao >= p_inicio)
    and (p_fim is null or m.data_movimentacao <= p_fim);
$$;

grant execute on function resumo_financeiro(date, date) to authenticated;

-- ------------------------------------------------------------
-- 7) contagem_produtos_por_categoria(): /configuracoes trazia uma linha por produto só
--    para contar quantos havia em cada categoria.
-- ------------------------------------------------------------

create or replace function contagem_produtos_por_categoria()
returns table (categoria_id uuid, total bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select p.categoria_id, count(*)::bigint
    from produtos p
   where p.user_id = auth.uid() and p.categoria_id is not null
   group by p.categoria_id;
$$;

grant execute on function contagem_produtos_por_categoria() to authenticated;

NOTIFY pgrst, 'reload schema';
