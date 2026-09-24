-- ============================================================
-- PIN de administração e edição de venda finalizada.
--
-- Este sistema é de um usuário só (sem contas separadas de admin/operador), então
-- "senha adm" aqui é um PIN curto guardado no perfil do negócio — uma segunda
-- confirmação antes de mexer numa venda já fechada, não um mecanismo de RBAC.
--
-- Escopo deliberadamente limitado: só campos que NÃO tocam estoque nem, na maior
-- parte dos casos, o valor já lançado no caixa/fiado (cliente, forma de pagamento,
-- observação). Itens e quantidades continuam fixos — para corrigir um item errado,
-- o fluxo é cancelar (RPC já existente `cancelar_venda`, que já estorna tudo) e
-- refazer a venda. Isso evita reabrir toda a lógica de concorrência de estoque só
-- para edição.
--
-- Desconto e entrega SÃO editáveis porque são os ajustes mais comuns depois do
-- fechamento ("esqueci de aplicar o desconto combinado") — e por isso a função
-- também precisa ajustar o valor já lançado no financeiro (a entrada no caixa, ou
-- a conta a receber do fiado), não só a linha de `vendas`.
-- ============================================================

alter table perfil_negocio add column pin_admin text;

create or replace function editar_venda(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_forma_pagamento text,
  p_observacao text,
  p_desconto numeric,
  p_valor_entrega numeric
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user         uuid := auth.uid();
  v_venda        vendas%rowtype;
  v_cliente_nome text;
  v_desconto     numeric := round(coalesce(p_desconto, 0), 2);
  v_entrega      numeric := round(coalesce(p_valor_entrega, 0), 2);
  v_total_novo   numeric;
  v_lucro_novo   numeric;
  v_delta        numeric;
  v_mov          record;
  v_cpr          record;
begin
  select * into v_venda from vendas where id = p_venda_id and user_id = v_user for update;
  if not found then
    raise exception 'Venda não encontrada ou não pertence a você.';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'A venda % está cancelada e não pode ser editada.', v_venda.numero;
  end if;

  if v_desconto < 0 or v_entrega < 0 then
    raise exception 'Desconto e entrega não podem ser negativos.';
  end if;
  if v_desconto > v_venda.subtotal then
    raise exception 'O desconto (%) é maior que o valor dos itens (%).', v_desconto, v_venda.subtotal;
  end if;

  if p_cliente_id is not null then
    select nome into v_cliente_nome from clientes where id = p_cliente_id and user_id = v_user;
    if not found then
      raise exception 'Cliente não encontrado ou não pertence a você.';
    end if;
  end if;

  v_total_novo := round(v_venda.subtotal - v_desconto + v_entrega, 2);
  v_lucro_novo := round(v_venda.subtotal - v_desconto - v_venda.custo_total, 2);
  v_delta := v_total_novo - v_venda.total;

  if v_venda.status = 'paga' then
    select id, conta_id into v_mov
      from movimentacoes_financeiras
     where referencia_venda_id = p_venda_id and user_id = v_user
     limit 1;

    if not found then
      raise exception
        'A entrada no caixa da venda % não foi encontrada. Ajuste manualmente no Financeiro em vez de editar aqui.',
        v_venda.numero;
    end if;

    if v_delta <> 0 then
      update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
      if v_mov.conta_id is not null then
        update contas set saldo = saldo + v_delta where id = v_mov.conta_id and user_id = v_user;
      end if;
    end if;
  else -- fiado
    select id, status, conta_id into v_cpr
      from contas_a_pagar_receber
     where referencia_venda_id = p_venda_id and user_id = v_user
     limit 1;

    if not found then
      raise exception 'A conta a receber da venda % não foi encontrada.', v_venda.numero;
    end if;

    if v_cpr.status = 'pendente' then
      update contas_a_pagar_receber set valor = v_total_novo where id = v_cpr.id;
    elsif v_delta <> 0 then
      -- Já foi recebido: o dinheiro está no caixa. Ajusta o valor lá também.
      select id into v_mov from movimentacoes_financeiras
       where referencia_venda_id = p_venda_id and user_id = v_user
       limit 1;

      if not found then
        raise exception
          'O fiado da venda % já foi recebido, mas a entrada no caixa não foi localizada. Ajuste manualmente no Financeiro.',
          v_venda.numero;
      end if;

      update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
      if v_cpr.conta_id is not null then
        update contas set saldo = saldo + v_delta where id = v_cpr.conta_id and user_id = v_user;
      end if;
      update contas_a_pagar_receber set valor = v_total_novo where id = v_cpr.id;
    end if;
  end if;

  update vendas
     set cliente_id = p_cliente_id,
         cliente_nome = v_cliente_nome,
         forma_pagamento = p_forma_pagamento,
         observacao = p_observacao,
         desconto = v_desconto,
         valor_entrega = v_entrega,
         total = v_total_novo,
         lucro = v_lucro_novo
   where id = p_venda_id and user_id = v_user;
end;
$$;

NOTIFY pgrst, 'reload schema';
