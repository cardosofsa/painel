-- ============================================================
-- 0089 — "Registrei um saque" do marketplace e prazo de liberação por loja.
--
-- Por quê: o repasse da Shopee/ML fica numa carteira da plataforma até o dono sacar para o
-- banco, e o sistema não tem como saber quando isso acontece (0087: "o dono lança quando faz o
-- saque"). Sem um registro, as contas "Repasse…" nunca eram baixadas e o saldo projetado
-- contaria o mesmo dinheiro duas vezes (repasse + entrada lançada à mão).
--
-- 1) `lojas_canal.dias_liberacao_repasse`: quantos dias a plataforma leva para liberar o
--    repasse depois que o pedido conclui. Alimenta a data prevista do repasse (padrão 7).
-- 2) `registrar_saque_marketplace(loja, valor, conta, data)`: credita o valor sacado na conta e
--    baixa, do mais antigo para o mais novo, os repasses liberados daquela loja até esse valor
--    (tolerância de R$ 0,05). O que o saque trouxe a mais ou a menos que os repasses (taxa,
--    arredondamento) não trava: o saldo sobe pelo valor que realmente caiu no banco.
--
-- A movimentação entra com `afeta_lucro = false` e categoria 'Repasse marketplace': a receita
-- do pedido já está no resultado (dre_mensal) e essa categoria é ignorada lá; o saque é só caixa.
--
-- security definer: a função baixa contas e mexe no saldo, e o dono é conferido em cada passo
-- (sessão, conta ativa, loja e conta dele). Idempotente. Termina com NOTIFY.
-- ============================================================

alter table lojas_canal add column if not exists dias_liberacao_repasse integer not null default 7;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lojas_canal_dias_liberacao_repasse_check') then
    alter table lojas_canal add constraint lojas_canal_dias_liberacao_repasse_check check (dias_liberacao_repasse between 0 and 60);
  end if;
end $$;

drop function if exists registrar_saque_marketplace(uuid, numeric, uuid, date);
create function registrar_saque_marketplace(p_loja_id uuid, p_valor numeric, p_conta_id uuid, p_data date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_data       date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor      numeric := round(p_valor, 2);
  v_loja_nome  text;
  v_restante   numeric;
  v_cpr        record;
  v_devido     numeric;
  v_baixados   integer := 0;
  v_baixado    numeric := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor > 10000000 then
    raise exception 'Informe o valor que caiu na sua conta.';
  end if;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do saque não pode ser no futuro.';
  end if;
  if p_conta_id is null or not exists (select 1 from contas where id = p_conta_id and user_id = v_user) then
    raise exception 'Escolha a conta onde o dinheiro caiu.';
  end if;
  select nome into v_loja_nome from lojas_canal where id = p_loja_id and user_id = v_user;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  v_restante := v_valor;
  for v_cpr in
    select c.id, c.valor, coalesce(c.valor_pago, 0) as valor_pago
      from contas_a_pagar_receber c
      join pedidos_marketplace p on p.id = c.referencia_pedido_marketplace_id and p.user_id = v_user
     where c.user_id = v_user
       and p.loja_id = p_loja_id
       and c.tipo = 'receber'
       and c.status = 'pendente'
       and not coalesce(c.aguardando_liberacao, false)
     order by c.data_vencimento, c.criado_em, c.id
       for update of c
  loop
    v_devido := round(v_cpr.valor - v_cpr.valor_pago, 2);
    exit when v_devido > v_restante + 0.05;
    update contas_a_pagar_receber
       set status = 'recebido', valor_pago = valor, data_pagamento = v_data, conta_id = p_conta_id
     where id = v_cpr.id;
    v_restante := v_restante - v_devido;
    v_baixado := v_baixado + v_devido;
    v_baixados := v_baixados + 1;
  end loop;

  insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
  values (v_user, 'entrada', v_valor, left(format('Saque %s', v_loja_nome), 300), 'Saque marketplace', 'Repasse marketplace', p_conta_id, false, v_data);
  update contas set saldo = saldo + v_valor where id = p_conta_id and user_id = v_user;

  return jsonb_build_object('baixados', v_baixados, 'valor_baixado', round(v_baixado, 2), 'diferenca', round(v_valor - v_baixado, 2));
end;
$$;

revoke execute on function registrar_saque_marketplace(uuid, numeric, uuid, date) from public, anon;
grant execute on function registrar_saque_marketplace(uuid, numeric, uuid, date) to authenticated;

NOTIFY pgrst, 'reload schema';
