-- ============================================================
-- 0092 — Cartão de crédito como tipo de conta (limite, disponível e fatura).
--
-- Por quê: toda compra/despesa sai de uma `conta`. O cartão do dono (não a maquineta do PDV)
-- não existia: não havia limite, nem quanto já foi usado, nem como pagar a fatura.
--
-- 1) `contas.tipo` ('conta' | 'cartao_credito'), `limite_total`, `dia_fechamento`, `dia_vencimento`.
--    Contas antigas ficam 'conta'. Cartão exige limite.
-- 2) Convenção: no cartão, `saldo` guarda a dívida em negativo. O gasto reduz o saldo como em
--    qualquer conta (nenhuma RPC de pagamento muda) e limite disponível = limite_total + saldo.
-- 3) Trava no banco: gasto que estoura o limite é recusado (trigger), e não só na tela.
-- 4) `pagar_fatura_cartao(cartao, conta_origem, valor, data)`: tira da conta corrente e quita a
--    dívida do cartão. As duas movimentações entram com `afeta_lucro = false` (categoria
--    'Fatura de cartão'): a despesa já foi contada quando o gasto foi feito no cartão.
--
-- security definer: mexe em dois saldos; o dono é conferido em cada passo. Idempotente.
-- ============================================================

alter table contas add column if not exists tipo text not null default 'conta';
alter table contas add column if not exists limite_total numeric;
alter table contas add column if not exists dia_fechamento integer;
alter table contas add column if not exists dia_vencimento integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_tipo_check') then
    alter table contas add constraint contas_tipo_check check (tipo in ('conta', 'cartao_credito'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_cartao_limite_check') then
    alter table contas add constraint contas_cartao_limite_check
      check (tipo <> 'cartao_credito' or (limite_total is not null and limite_total > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_dias_cartao_check') then
    alter table contas add constraint contas_dias_cartao_check
      check ((dia_fechamento is null or dia_fechamento between 1 and 31) and (dia_vencimento is null or dia_vencimento between 1 and 31));
  end if;
end $$;

-- Gasto acima do limite disponível é recusado; pagar fatura (saldo subindo) sempre passa.
create or replace function validar_limite_cartao() returns trigger
language plpgsql
as $$
declare
  v_disponivel numeric;
begin
  if new.tipo <> 'cartao_credito' or new.limite_total is null or new.saldo >= -new.limite_total then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Cadastro já com a dívida acima do limite informado: recusa.
    v_disponivel := new.limite_total;
  elsif new.saldo < old.saldo then
    v_disponivel := greatest(0, new.limite_total + old.saldo);
  else
    -- Saldo não piorou (pagamento, ou limite editado para baixo): deixa passar.
    return new;
  end if;
  raise exception 'Limite do cartão % insuficiente: disponível R$ %.', new.nome, to_char(v_disponivel, 'FM999G999G990D00');
end;
$$;

drop trigger if exists contas_validar_limite_cartao on contas;
create trigger contas_validar_limite_cartao
  before insert or update of saldo, limite_total, tipo on contas
  for each row execute function validar_limite_cartao();

drop function if exists pagar_fatura_cartao(uuid, uuid, numeric, date);
create function pagar_fatura_cartao(p_cartao_id uuid, p_conta_origem_id uuid, p_valor numeric, p_data date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_data    date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor   numeric := round(p_valor, 2);
  v_cartao  record;
  v_origem  record;
  v_divida  numeric;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor > 10000000 then
    raise exception 'Informe o valor da fatura.';
  end if;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;

  select * into v_cartao from contas where id = p_cartao_id and user_id = v_user and tipo = 'cartao_credito' for update;
  if not found then
    raise exception 'Cartão não encontrado.';
  end if;
  select * into v_origem from contas where id = p_conta_origem_id and user_id = v_user and tipo = 'conta' for update;
  if not found then
    raise exception 'Escolha a conta de onde sai o pagamento.';
  end if;

  v_divida := round(greatest(0, -v_cartao.saldo), 2);
  if v_divida = 0 then
    raise exception 'Esse cartão não tem fatura em aberto.';
  end if;
  if v_valor > v_divida then
    raise exception 'O valor passa da fatura em aberto (R$ %).', to_char(v_divida, 'FM999G999G990D00');
  end if;

  update contas set saldo = saldo - v_valor where id = v_origem.id and user_id = v_user;
  update contas set saldo = saldo + v_valor where id = v_cartao.id and user_id = v_user;

  insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
  values
    (v_user, 'saida', v_valor, left(format('Fatura %s', v_cartao.nome), 300), 'Fatura de cartão', 'Fatura de cartão', v_origem.id, false, v_data),
    (v_user, 'entrada', v_valor, left(format('Pagamento da fatura %s', v_cartao.nome), 300), 'Fatura de cartão', 'Fatura de cartão', v_cartao.id, false, v_data);

  return jsonb_build_object('pago', v_valor, 'divida_restante', round(v_divida - v_valor, 2));
end;
$$;

revoke execute on function pagar_fatura_cartao(uuid, uuid, numeric, date) from public, anon;
grant execute on function pagar_fatura_cartao(uuid, uuid, numeric, date) to authenticated;

NOTIFY pgrst, 'reload schema';
