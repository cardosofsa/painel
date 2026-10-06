-- 0067 — Dívidas e contas antigas (saldo inicial) ligadas a fornecedor ou cliente.
--
-- Quem começa a usar o sistema já deve a fornecedores e tem clientes devendo no
-- crediário. Até aqui o único jeito era um pedido de compra com data antiga (que entra nas
-- compras do período e no recebimento de estoque) ou uma conta avulsa sem dono (que não
-- aparecia em Fornecedores → "Em aberto" nem no limite do crediário do cliente).
--
-- 1) `contas_a_pagar_receber.fornecedor_id` + trava de dono (a de `cliente_id` já existia).
-- 2) `origem_saldo_inicial`: a conta veio de antes do sistema. O "já pago" dela NÃO saiu do
--    caixa de hoje — por isso não gera movimentação nem mexe em `contas.saldo`.
-- 3) `lancar_divida_antiga(...)`: gera as parcelas numa transação só.
-- 4) `em_aberto_por_fornecedor()` soma também as contas ligadas direto ao fornecedor.
-- 5) `fiado_em_uso_cliente()` soma o crediário antigo do cliente (e desconta o que já foi
--    recebido em parte, que antes contava inteiro).
-- 6) `receber_conta(...)`: crediário antigo recebe como crediário (categoria e encargos).
--
-- Idempotente: pode rodar de novo por cima.

alter table contas_a_pagar_receber add column if not exists fornecedor_id uuid references fornecedores(id) on delete set null;
alter table contas_a_pagar_receber add column if not exists origem_saldo_inicial boolean not null default false;
create index if not exists contas_pr_fornecedor_idx on contas_a_pagar_receber (user_id, fornecedor_id) where fornecedor_id is not null;
create index if not exists contas_pr_cliente_idx on contas_a_pagar_receber (user_id, cliente_id) where cliente_id is not null;

-- 1) Trava de dono: a mesma trigger da 0026, agora com as duas colunas.
drop trigger if exists trg_valida_vinculo_contas_a_pagar_receber on contas_a_pagar_receber;
create trigger trg_valida_vinculo_contas_a_pagar_receber
  before insert or update of cliente_id, fornecedor_id on contas_a_pagar_receber
  for each row execute function validar_vinculo_do_dono('cliente_id', 'clientes', 'fornecedor_id', 'fornecedores');

-- 3) Lançar dívida antiga.
create or replace function lancar_divida_antiga(
  p_tipo text,
  p_fornecedor_id uuid,
  p_cliente_id uuid,
  p_descricao text,
  p_valor_total numeric,
  p_parcelas integer,
  p_primeiro_venc date,
  p_intervalo_dias integer default 30,
  p_ja_pago numeric default 0,
  p_conta_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n integer := greatest(coalesce(p_parcelas, 1), 1);
  v_intervalo integer := greatest(coalesce(p_intervalo_dias, 30), 1);
  v_total numeric := round(coalesce(p_valor_total, 0), 2);
  v_pago_restante numeric := round(greatest(coalesce(p_ja_pago, 0), 0), 2);
  v_desc text := btrim(coalesce(p_descricao, ''));
  v_base numeric;
  v_valor numeric;
  v_pago numeric;
  v_venc date;
  i integer;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_tipo not in ('pagar', 'receber') then
    raise exception 'Tipo inválido: use pagar ou receber.';
  end if;
  if p_tipo = 'pagar' and p_cliente_id is not null then
    raise exception 'Conta a pagar se liga a fornecedor, não a cliente.';
  end if;
  if p_tipo = 'receber' and p_fornecedor_id is not null then
    raise exception 'Conta a receber se liga a cliente, não a fornecedor.';
  end if;
  if v_desc = '' then
    raise exception 'Descreva a dívida (ex.: "Saldo anterior com o fornecedor").';
  end if;
  if v_total <= 0 then
    raise exception 'Informe o valor total da dívida.';
  end if;
  if v_n > 48 then
    raise exception 'No máximo 48 parcelas.';
  end if;
  if v_intervalo > 120 then
    raise exception 'O intervalo entre parcelas vai até 120 dias.';
  end if;
  if p_primeiro_venc is null then
    raise exception 'Informe o vencimento da primeira parcela.';
  end if;
  if v_pago_restante > v_total then
    raise exception 'O valor já pago não pode passar do total da dívida.';
  end if;

  v_base := trunc(v_total / v_n, 2);
  for i in 1..v_n loop
    -- Sobra do arredondamento vai para a última parcela (o total bate no centavo).
    v_valor := case when i = v_n then v_total - v_base * (v_n - 1) else v_base end;
    v_venc := case
      when v_intervalo = 30 then (p_primeiro_venc + make_interval(months => i - 1))::date
      else p_primeiro_venc + v_intervalo * (i - 1)
    end;
    -- O que já foi pago abate as parcelas na ordem: primeiro a mais antiga.
    v_pago := least(v_pago_restante, v_valor);
    v_pago_restante := v_pago_restante - v_pago;

    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, valor_pago, data_vencimento, status, conta_id,
      fornecedor_id, cliente_id, parcela_numero, total_parcelas, origem_saldo_inicial
    ) values (
      v_user, p_tipo,
      case when v_n > 1 then format('%s — parcela %s/%s', v_desc, i, v_n) else v_desc end,
      v_valor, v_pago, v_venc,
      case when v_pago >= v_valor then (case when p_tipo = 'pagar' then 'pago' else 'recebido' end) else 'pendente' end,
      p_conta_id, p_fornecedor_id, p_cliente_id, i, v_n, true
    );
  end loop;
  return v_n;
end;
$$;

revoke execute on function lancar_divida_antiga(text, uuid, uuid, text, numeric, integer, date, integer, numeric, uuid) from public, anon;
grant execute on function lancar_divida_antiga(text, uuid, uuid, text, numeric, integer, date, integer, numeric, uuid) to authenticated;

-- 4) Quanto devo a cada fornecedor: parcelas de pedido de compra + contas ligadas direto.
-- DROP antes: a regra da 0017 (RETURNS TABLE não muda com CREATE OR REPLACE) — aqui o
-- retorno é o mesmo, mas o DROP deixa a migração igual à 0064, que já fazia assim.
drop function if exists em_aberto_por_fornecedor();
create function em_aberto_por_fornecedor()
returns table (fornecedor_id uuid, em_aberto numeric, atrasado numeric, proximo_vencimento date)
language sql
stable
security invoker
set search_path = public
as $$
  select f.fornecedor_id,
         sum(f.aberto),
         coalesce(sum(f.aberto) filter (where f.data_vencimento < current_date), 0),
         min(f.data_vencimento)
    from (
      select coalesce(c.fornecedor_id, p.fornecedor_id) as fornecedor_id,
             c.valor - c.valor_pago as aberto,
             c.data_vencimento
        from contas_a_pagar_receber c
        left join pedidos_compra p on p.id = c.referencia_pedido_compra_id
       where c.user_id = auth.uid() and c.tipo = 'pagar' and c.status = 'pendente'
    ) f
   where f.fornecedor_id is not null
   group by f.fornecedor_id;
$$;

revoke execute on function em_aberto_por_fornecedor() from public, anon;
grant execute on function em_aberto_por_fornecedor() to authenticated;

-- 5) Crediário em uso: + crediário antigo (conta a receber do cliente, sem venda) e o que
-- ainda falta de cada conta (valor - valor_pago), não o valor cheio.
create or replace function fiado_em_uso_cliente(p_cliente_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(sum(valor), 0) from (
    select vp.valor as valor
    from venda_parcelas vp
    join vendas v on v.id = vp.venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid() and vp.status = 'pendente'
    union all
    select cpr.valor - cpr.valor_pago
    from contas_a_pagar_receber cpr
    join vendas v on v.id = cpr.referencia_venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid()
      and cpr.tipo = 'receber' and cpr.status = 'pendente'
      and not exists (select 1 from venda_parcelas vp2 where vp2.venda_id = v.id)
    union all
    select cpr.valor - cpr.valor_pago
    from contas_a_pagar_receber cpr
    where cpr.cliente_id = p_cliente_id and cpr.user_id = auth.uid()
      and cpr.referencia_venda_id is null
      and cpr.tipo = 'receber' and cpr.status = 'pendente'
  ) t;
$$;

grant execute on function fiado_em_uso_cliente(uuid) to authenticated;

-- 6) Receber: crediário antigo (cliente, sem venda) também é crediário — mesma categoria
-- no Resultado e mesmos encargos. Assinatura e retorno iguais aos da 0065.
create or replace function receber_conta(
  p_id uuid,
  p_valor numeric,
  p_data date default null,
  p_conta_id uuid default null,
  p_quitar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cpr contas_a_pagar_receber%rowtype;
  v_conta uuid;
  v_data date := coalesce(p_data, current_date);
  v_restante numeric;
  v_principal numeric;
  v_encargo numeric;
  v_pago numeric;
  v_quitada boolean;
  v_crediario boolean;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o recebimento.';
  end if;
  select * into v_cpr from contas_a_pagar_receber where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;
  if v_cpr.tipo <> 'receber' then
    raise exception 'Só contas a receber aceitam recebimento por aqui.';
  end if;
  if v_cpr.status <> 'pendente' then
    raise exception 'Esta conta já foi recebida.';
  end if;
  if v_cpr.referencia_venda_id is not null and exists (select 1 from venda_parcelas where venda_id = v_cpr.referencia_venda_id) then
    raise exception 'Este crediário é parcelado: receba pelas parcelas.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if v_data > current_date + 1 then
    raise exception 'A data do recebimento não pode ser no futuro.';
  end if;
  v_conta := coalesce(p_conta_id, v_cpr.conta_id);
  if v_conta is null then
    raise exception 'Escolha a conta que recebeu o dinheiro.';
  end if;

  v_restante := greatest(v_cpr.valor - v_cpr.valor_pago, 0);
  v_principal := least(round(p_valor, 2), v_restante);
  v_encargo := greatest(round(p_valor, 2) - v_restante, 0);
  v_crediario := v_cpr.referencia_venda_id is not null or v_cpr.cliente_id is not null;

  if v_principal > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_principal, v_cpr.descricao,
      case when v_crediario then 'Crediário' else 'Conta a receber recebida' end,
      case when v_crediario then 'Recebimento de crediário' end,
      v_conta, true, v_data, v_cpr.referencia_venda_id
    );
  end if;
  if v_encargo > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_encargo, v_cpr.descricao || ' — multa e juros',
      case when v_crediario then 'Crediário' else 'Conta a receber recebida' end,
      'Juros e multa de crediário', v_conta, true, v_data, v_cpr.referencia_venda_id
    );
  end if;

  update contas set saldo = saldo + round(p_valor, 2) where id = v_conta and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence a você.';
  end if;

  v_pago := v_cpr.valor_pago + v_principal;
  v_quitada := p_quitar or v_pago >= v_cpr.valor - 0.005;
  update contas_a_pagar_receber
     set valor_pago = v_pago,
         data_pagamento = v_data,
         status = case when v_quitada then 'recebido' else 'pendente' end
   where id = p_id;

  return jsonb_build_object('valor_pago', v_pago, 'quitada', v_quitada, 'restante', greatest(v_cpr.valor - v_pago, 0));
end;
$$;

revoke execute on function receber_conta(uuid, numeric, date, uuid, boolean) from public, anon;
grant execute on function receber_conta(uuid, numeric, date, uuid, boolean) to authenticated;

NOTIFY pgrst, 'reload schema';
