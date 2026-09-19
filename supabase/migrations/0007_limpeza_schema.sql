-- ============================================================
-- Limpeza: função e colunas sem uso confirmado no código
-- ============================================================

-- Substituída por registrar_movimentacao_financeira (0005), que já ajusta o saldo
-- da conta na mesma transação. Sem chamada .rpc() no código, sem trigger.
drop function if exists ajustar_saldo_conta(uuid, numeric);

-- Substituída por pedidos_compra.armazem_id (0002); nunca lida/escrita.
alter table pedidos_compra drop column if exists loja;

-- Nunca lidas nem escritas pela UI de Despesas Fixas.
alter table despesas_fixas drop column if exists recorrencia;
alter table despesas_fixas drop column if exists ativo;

-- Gravada ao parcelar uma compra, mas nunca exibida em lugar nenhum.
alter table contas_a_pagar_receber drop column if exists forma_pagamento;

NOTIFY pgrst, 'reload schema';
