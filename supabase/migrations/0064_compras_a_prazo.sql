-- ============================================================
-- 0064 — Compras a prazo e histórico de pagamentos; "fiado" vira "crediário" (Fase 12.1).
--
-- Toda compra já gerava contas a pagar (uma por parcela), mas pagar era "tudo ou nada"
-- (`quitar_conta_pagar_receber`: valor cheio, data de hoje, sem registro do que foi pago).
-- Agora:
--   * cada pagamento fica registrado em `pagamentos_conta` (data, valor, conta) — é o
--     histórico mostrado em Compras e no Financeiro;
--   * `pagar_conta` aceita valor livre: menos que o devido deixa o resto pendente, mais
--     (juros) quita; `p_quitar` dá a parcela por quitada mesmo pagando menos (desconto);
--   * `estornar_pagamento_conta` desfaz um pagamento lançado errado;
--   * `gerar_pagamento_compra` monta as parcelas no banco (antes era JS, sem transação).
--     À vista já nasce paga na data do pedido.
--   * `cancelar_pedido_compra` não apaga mais parcela que já teve pagamento.
--
-- Nome: na venda, "fiado" passa a aparecer como "Crediário" (identificadores do banco
-- continuam `fiado` — só o texto muda). Descrições já gravadas são atualizadas aqui e um
-- gatilho troca o prefixo das novas, para não reescrever `registrar_venda` (0052) inteira.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Colunas novas nas contas a pagar/receber
alter table contas_a_pagar_receber add column if not exists parcela_numero integer;
alter table contas_a_pagar_receber add column if not exists total_parcelas integer;
alter table contas_a_pagar_receber add column if not exists valor_pago numeric(12,2) not null default 0;
alter table contas_a_pagar_receber add column if not exists data_pagamento date;

-- Backfill: o que já estava pago foi pago inteiro (a data não foi guardada).
update contas_a_pagar_receber set valor_pago = valor
 where status in ('pago', 'recebido') and valor_pago = 0;

-- Parcelas antigas de compra: "Pedido MV-0001 — parcela 2/5" → número e total.
update contas_a_pagar_receber
   set parcela_numero = (regexp_match(descricao, 'parcela (\d+)/(\d+)'))[1]::int,
       total_parcelas = (regexp_match(descricao, 'parcela (\d+)/(\d+)'))[2]::int
 where referencia_pedido_compra_id is not null
   and parcela_numero is null
   and descricao ~ 'parcela \d+/\d+';
update contas_a_pagar_receber set parcela_numero = 1, total_parcelas = 1
 where referencia_pedido_compra_id is not null and parcela_numero is null;

-- 2) Histórico de pagamentos (um registro por pagamento)
create table if not exists pagamentos_conta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  conta_pr_id uuid not null references contas_a_pagar_receber(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  conta_id uuid references contas(id) on delete set null,
  movimentacao_id uuid references movimentacoes_financeiras(id) on delete set null,
  observacao text check (observacao is null or length(observacao) <= 200),
  criado_em timestamptz not null default now()
);

create index if not exists pagamentos_conta_cpr_idx on pagamentos_conta (conta_pr_id);
create index if not exists pagamentos_conta_data_idx on pagamentos_conta (user_id, data desc);

alter table pagamentos_conta enable row level security;
drop policy if exists "dono_pagamentos_conta" on pagamentos_conta;
create policy "dono_pagamentos_conta" on pagamentos_conta for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists pagamentos_conta_vinculo on pagamentos_conta;
create trigger pagamentos_conta_vinculo before insert or update of conta_pr_id, conta_id on pagamentos_conta
for each row execute function validar_vinculo_do_dono('conta_pr_id', 'contas_a_pagar_receber', 'conta_id', 'contas');

-- 3) Pagar (valor livre)
create or replace function pagar_conta(
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
  v_mov uuid;
  v_pago numeric;
  v_quitada boolean;
  v_desc text;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o pagamento.';
  end if;
  select * into v_cpr from contas_a_pagar_receber where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;
  if v_cpr.tipo <> 'pagar' then
    raise exception 'Só contas a pagar aceitam pagamento por aqui.';
  end if;
  if v_cpr.status <> 'pendente' then
    raise exception 'Esta parcela já está quitada.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor pago.';
  end if;
  if v_data > current_date + 1 then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;
  v_conta := coalesce(p_conta_id, v_cpr.conta_id);
  if v_conta is null then
    raise exception 'Escolha a conta de onde saiu o dinheiro.';
  end if;

  v_desc := v_cpr.descricao;
  if v_cpr.referencia_pedido_compra_id is not null then
    select coalesce(v_desc || ' — ' || f.nome, v_desc) into v_desc
      from pedidos_compra p left join fornecedores f on f.id = p.fornecedor_id
     where p.id = v_cpr.referencia_pedido_compra_id;
  end if;

  insert into movimentacoes_financeiras (
    user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
    data_movimentacao, referencia_pedido_compra_id
  ) values (
    v_user, 'saida', -round(p_valor, 2), coalesce(v_desc, v_cpr.descricao),
    'Pagamento de conta',
    case when v_cpr.referencia_pedido_compra_id is not null then 'Compra de mercadoria' else 'Contas a pagar' end,
    v_conta, true, v_data, v_cpr.referencia_pedido_compra_id
  ) returning id into v_mov;

  update contas set saldo = saldo - round(p_valor, 2) where id = v_conta and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence a você.';
  end if;

  insert into pagamentos_conta (user_id, conta_pr_id, valor, data, conta_id, movimentacao_id)
  values (v_user, p_id, round(p_valor, 2), v_data, v_conta, v_mov);

  v_pago := v_cpr.valor_pago + round(p_valor, 2);
  v_quitada := p_quitar or v_pago >= v_cpr.valor - 0.005;

  update contas_a_pagar_receber
     set valor_pago = v_pago,
         data_pagamento = v_data,
         status = case when v_quitada then 'pago' else 'pendente' end
   where id = p_id;

  return jsonb_build_object('valor_pago', v_pago, 'quitada', v_quitada, 'restante', greatest(v_cpr.valor - v_pago, 0));
end;
$$;

revoke execute on function pagar_conta(uuid, numeric, date, uuid, boolean) from public, anon;
grant execute on function pagar_conta(uuid, numeric, date, uuid, boolean) to authenticated;

-- 4) Estornar um pagamento
create or replace function estornar_pagamento_conta(p_pagamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pag pagamentos_conta%rowtype;
  v_cpr contas_a_pagar_receber%rowtype;
  v_pago numeric;
begin
  select * into v_pag from pagamentos_conta where id = p_pagamento_id and user_id = v_user for update;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;
  select * into v_cpr from contas_a_pagar_receber where id = v_pag.conta_pr_id and user_id = v_user for update;

  if v_pag.movimentacao_id is not null then
    delete from movimentacoes_financeiras where id = v_pag.movimentacao_id and user_id = v_user;
  end if;
  if v_pag.conta_id is not null then
    update contas set saldo = saldo + v_pag.valor where id = v_pag.conta_id and user_id = v_user;
  end if;
  delete from pagamentos_conta where id = p_pagamento_id;

  v_pago := greatest(v_cpr.valor_pago - v_pag.valor, 0);
  update contas_a_pagar_receber
     set valor_pago = v_pago,
         status = 'pendente',
         data_pagamento = (select max(data) from pagamentos_conta where conta_pr_id = v_cpr.id)
   where id = v_cpr.id;
end;
$$;

revoke execute on function estornar_pagamento_conta(uuid) from public, anon;
grant execute on function estornar_pagamento_conta(uuid) to authenticated;

-- 5) Parcelas de um pedido de compra (gerado no banco, numa transação só)
create or replace function gerar_pagamento_compra(
  p_pedido uuid,
  p_a_prazo boolean,
  p_parcelas integer,
  p_primeiro_venc date,
  p_intervalo_dias integer,
  p_conta_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ped pedidos_compra%rowtype;
  v_n integer := case when p_a_prazo then greatest(coalesce(p_parcelas, 1), 1) else 1 end;
  v_intervalo integer := greatest(coalesce(p_intervalo_dias, 30), 1);
  v_base numeric;
  v_valor numeric;
  v_venc date;
  v_id uuid;
  i integer;
begin
  if v_n > 48 then
    raise exception 'No máximo 48 parcelas.';
  end if;
  if v_intervalo > 120 then
    raise exception 'O intervalo entre parcelas vai até 120 dias.';
  end if;
  select * into v_ped from pedidos_compra where id = p_pedido and user_id = v_user;
  if not found then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if exists (select 1 from contas_a_pagar_receber where referencia_pedido_compra_id = p_pedido and user_id = v_user) then
    raise exception 'Este pedido já tem parcelas lançadas.';
  end if;

  v_base := trunc(v_ped.valor_total / v_n, 2);
  for i in 1..v_n loop
    -- Sobra do arredondamento vai para a última parcela (o total bate centavo por centavo).
    v_valor := case when i = v_n then v_ped.valor_total - v_base * (v_n - 1) else v_base end;
    v_venc := case
      when not p_a_prazo then v_ped.data_pedido
      when v_intervalo = 30 then (coalesce(p_primeiro_venc, v_ped.data_pedido) + make_interval(months => i - 1))::date
      else coalesce(p_primeiro_venc, v_ped.data_pedido) + v_intervalo * (i - 1)
    end;
    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
      referencia_pedido_compra_id, parcela_numero, total_parcelas
    ) values (
      v_user, 'pagar',
      case when v_n > 1 then format('Pedido %s — parcela %s/%s', v_ped.numero, i, v_n) else format('Pedido %s', v_ped.numero) end,
      v_valor, v_venc, case when v_valor <= 0 then 'pago' else 'pendente' end, p_conta_id, p_pedido, i, v_n
    ) returning id into v_id;

    -- À vista: já sai paga, na data do pedido.
    if not p_a_prazo and v_valor > 0 then
      perform pagar_conta(v_id, v_valor, least(v_ped.data_pedido, current_date), p_conta_id, true);
    end if;
  end loop;
end;
$$;

revoke execute on function gerar_pagamento_compra(uuid, boolean, integer, date, integer, uuid) from public, anon;
grant execute on function gerar_pagamento_compra(uuid, boolean, integer, date, integer, uuid) to authenticated;

-- 6) Cancelar pedido: parcela que já teve pagamento fica (é dinheiro que saiu de verdade).
drop function if exists cancelar_pedido_compra(uuid);
create function cancelar_pedido_compra(p_pedido_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_removidas integer;
begin
  select status into v_status from pedidos_compra where id = p_pedido_id and user_id = v_user for update;
  if v_status is null then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if v_status in ('recebido', 'cancelado') then
    raise exception 'Este pedido já foi % e não pode ser cancelado.', case v_status when 'recebido' then 'completado' else 'cancelado' end;
  end if;

  update pedidos_compra set status = 'cancelado', cancelado_em = now() where id = p_pedido_id;

  delete from contas_a_pagar_receber
   where referencia_pedido_compra_id = p_pedido_id and user_id = v_user
     and status = 'pendente' and valor_pago = 0;
  get diagnostics v_removidas = row_count;

  -- Pago em parte: o que já foi pago fica registrado e a parcela é dada por encerrada.
  update contas_a_pagar_receber set status = 'pago'
   where referencia_pedido_compra_id = p_pedido_id and user_id = v_user
     and status = 'pendente' and valor_pago > 0;
  return v_removidas;
end;
$$;

revoke execute on function cancelar_pedido_compra(uuid) from public, anon;
grant execute on function cancelar_pedido_compra(uuid) to authenticated;

-- 6b) Quanto devo a cada fornecedor (Fornecedores → "Em aberto"). Soma no banco: `numeric`
-- é exato e não depende de quantas parcelas a tela carregou.
drop function if exists em_aberto_por_fornecedor();
create function em_aberto_por_fornecedor()
returns table (fornecedor_id uuid, em_aberto numeric, atrasado numeric, proximo_vencimento date)
language sql
stable
security invoker
set search_path = public
as $$
  select p.fornecedor_id,
         sum(c.valor - c.valor_pago),
         coalesce(sum(c.valor - c.valor_pago) filter (where c.data_vencimento < current_date), 0),
         min(c.data_vencimento)
    from contas_a_pagar_receber c
    join pedidos_compra p on p.id = c.referencia_pedido_compra_id
   where c.user_id = auth.uid() and c.tipo = 'pagar' and c.status = 'pendente'
   group by p.fornecedor_id;
$$;

revoke execute on function em_aberto_por_fornecedor() from public, anon;
grant execute on function em_aberto_por_fornecedor() to authenticated;

-- 7) Quitar pelo jeito antigo (botão do Financeiro para contas a receber) também guarda data e valor.
create or replace function quitar_conta_pagar_receber(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cpr contas_a_pagar_receber%rowtype;
  v_delta numeric;
begin
  select * into v_cpr from contas_a_pagar_receber where id = p_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Registro não encontrado ou não pertence ao usuário atual';
  end if;
  if v_cpr.status <> 'pendente' then
    raise exception 'Esta conta já está quitada.';
  end if;

  -- Conta a pagar passa pelo mesmo caminho do pagamento com valor (fica no histórico).
  if v_cpr.tipo = 'pagar' and v_cpr.conta_id is not null then
    perform pagar_conta(p_id, v_cpr.valor - v_cpr.valor_pago, current_date, v_cpr.conta_id, true);
    return;
  end if;

  update contas_a_pagar_receber
     set status = case when v_cpr.tipo = 'pagar' then 'pago' else 'recebido' end,
         valor_pago = v_cpr.valor, data_pagamento = current_date
   where id = p_id;

  if v_cpr.conta_id is not null then
    v_delta := case when v_cpr.tipo = 'pagar' then -v_cpr.valor else v_cpr.valor end;
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id, referencia_pedido_compra_id
    ) values (
      auth.uid(),
      case when v_cpr.tipo = 'pagar' then 'saida' else 'entrada' end,
      v_delta, v_cpr.descricao,
      case when v_cpr.tipo = 'pagar' then 'Conta a pagar quitada' else 'Conta a receber recebida' end,
      case when v_cpr.referencia_venda_id is not null then 'Recebimento de crediário' end,
      v_cpr.conta_id, true, current_date, v_cpr.referencia_venda_id, v_cpr.referencia_pedido_compra_id
    );
    update contas set saldo = saldo + v_delta where id = v_cpr.conta_id and user_id = auth.uid();
  end if;
end;
$$;

-- 8) "Fiado" → "Crediário" no que o banco escreve
update contas_a_pagar_receber set descricao = 'Crediário' || substr(descricao, 6)
 where descricao like 'Fiado — %';
update movimentacoes_financeiras set origem = 'Crediário' where origem = 'Fiado';
update movimentacoes_financeiras set categoria = 'Recebimento de crediário' where categoria = 'Recebimento de fiado';

create or replace function trocar_prefixo_fiado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.descricao like 'Fiado — %' then
    new.descricao := 'Crediário' || substr(new.descricao, 6);
  end if;
  return new;
end;
$$;

drop trigger if exists contas_pr_prefixo_crediario on contas_a_pagar_receber;
create trigger contas_pr_prefixo_crediario before insert on contas_a_pagar_receber
for each row execute function trocar_prefixo_fiado();

create or replace function marcar_parcela_paga(
  p_parcela_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_conta_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_parcela venda_parcelas%rowtype;
  v_venda vendas%rowtype;
  v_todas_pagas boolean;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o pagamento.';
  end if;

  select * into v_parcela from venda_parcelas where id = p_parcela_id and user_id = v_user for update;
  if not found then
    raise exception 'Parcela não encontrada ou não pertence a você.';
  end if;
  if v_parcela.status = 'paga' then
    raise exception 'Esta parcela já está paga.';
  end if;
  if p_valor_pago is null or p_valor_pago <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if p_conta_id is null then
    raise exception 'Escolha a conta que recebeu o pagamento.';
  end if;

  select * into v_venda from vendas where id = v_parcela.venda_id and user_id = v_user;

  update venda_parcelas
  set status = 'paga', data_pagamento = coalesce(p_data_pagamento, current_date),
      valor_pago = p_valor_pago, conta_id = p_conta_id
  where id = p_parcela_id;

  insert into movimentacoes_financeiras (
    user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
    data_movimentacao, referencia_venda_id
  ) values (
    v_user, 'entrada', p_valor_pago,
    format('Venda %s — parcela %s/%s', v_venda.numero, v_parcela.numero, v_parcela.total_parcelas),
    'Crediário', 'Recebimento de crediário', p_conta_id, true, coalesce(p_data_pagamento, current_date), v_venda.id
  );

  update contas set saldo = saldo + p_valor_pago where id = p_conta_id and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;

  select not exists (
    select 1 from venda_parcelas where venda_id = v_parcela.venda_id and status = 'pendente'
  ) into v_todas_pagas;

  if v_todas_pagas then
    update contas_a_pagar_receber
    set status = 'recebido',
        valor_pago = valor,
        data_pagamento = coalesce(p_data_pagamento, current_date)
    where referencia_venda_id = v_parcela.venda_id and tipo = 'receber' and user_id = v_user;
  end if;
end;
$$;

grant execute on function marcar_parcela_paga(uuid, numeric, date, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
