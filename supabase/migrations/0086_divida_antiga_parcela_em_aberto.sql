-- ============================================================
-- 0086: dívida antiga com parte já paga divide só o que fica em aberto.
--
-- Na 0067, "R$ 4.200, já pago R$ 1.200, em 3x" gerava 3 x R$ 1.400 com R$ 1.200 abatidos
-- da 1ª parcela (fica 200 + 1.400 + 1.400). O esperado é 3 x R$ 1.000: o já pago vira um
-- lançamento quitado à parte (mantém o total da dívida no histórico, sem mexer no caixa) e
-- as parcelas repartem os R$ 3.000 restantes. Mesma assinatura e retorno: create or replace.
-- Idempotente.
-- ============================================================

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
  v_aberto numeric;
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

  -- O que já foi pago vira UM lançamento quitado à parte (histórico do total), e as
  -- parcelas dividem só o que fica em aberto: 4.200 com 1.200 pagos em 3x = 3 x 1.000.
  -- Antes, o total era dividido e o já pago abatia a 1ª parcela (3 x 1.400, a 1ª com 1.200).
  v_aberto := v_total - v_pago_restante;
  if v_pago_restante > 0 then
    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, valor_pago, data_vencimento, status, conta_id,
      fornecedor_id, cliente_id, parcela_numero, total_parcelas, origem_saldo_inicial
    ) values (
      v_user, p_tipo,
      case when v_aberto > 0 then format('%s — já pago antes', v_desc) else v_desc end,
      v_pago_restante, v_pago_restante,
      least(p_primeiro_venc, (now() at time zone 'America/Sao_Paulo')::date),
      case when p_tipo = 'pagar' then 'pago' else 'recebido' end,
      p_conta_id, p_fornecedor_id, p_cliente_id, null, case when v_aberto > 0 then v_n else 1 end, true
    );
  end if;
  if v_aberto <= 0 then
    return 1;
  end if;

  v_base := trunc(v_aberto / v_n, 2);
  for i in 1..v_n loop
    -- Sobra do arredondamento vai para a última parcela (o total bate no centavo).
    v_valor := case when i = v_n then v_aberto - v_base * (v_n - 1) else v_base end;
    v_venc := case
      when v_intervalo = 30 then (p_primeiro_venc + make_interval(months => i - 1))::date
      else p_primeiro_venc + v_intervalo * (i - 1)
    end;

    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, valor_pago, data_vencimento, status, conta_id,
      fornecedor_id, cliente_id, parcela_numero, total_parcelas, origem_saldo_inicial
    ) values (
      v_user, p_tipo,
      case when v_n > 1 then format('%s — parcela %s/%s', v_desc, i, v_n) else v_desc end,
      v_valor, 0, v_venc, 'pendente',
      p_conta_id, p_fornecedor_id, p_cliente_id, i, v_n, true
    );
  end loop;
  return v_n;
end;
$$;

revoke execute on function lancar_divida_antiga(text, uuid, uuid, text, numeric, integer, date, integer, numeric, uuid) from public, anon;
grant execute on function lancar_divida_antiga(text, uuid, uuid, text, numeric, integer, date, integer, numeric, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
