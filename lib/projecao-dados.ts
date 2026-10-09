/**
 * Monta a entrada do saldo projetado (`saldo-projetado.ts`) a partir das linhas cruas do
 * banco. É o que a tela do Financeiro e o cron de fechamento têm em comum: o número do
 * histórico e o da tela vêm do mesmo caminho. Puro; coberto por `projecao-dados.test.ts`.
 */

import { ocorrenciasDespesasFixas, type ContaExistente, type DespesaFixaFonte, type PagamentoDespesaFixa } from "./despesas-fixas-calendario";
import { DIAS_LIBERACAO_PADRAO, eRepasseMarketplace, previsaoRepasse } from "./repasse-marketplace";
import { restanteParcela } from "./pagamentos";
import { fimDoMes, inicioDoMes, type ContaParaProjecao, type EntradaProjecao } from "./saldo-projetado";
import { somarDiasIso } from "./format";

export interface ParcelaCrua {
  status: string;
  valor: number;
  valor_pago?: number | null;
  data_vencimento: string;
  /** Venda cancelada não gera crediário. */
  vendas?: { status: string } | null;
}

/** O que se sabe do pedido de marketplace de cada repasse. */
export interface PedidoMkt {
  loja_id: string | null;
  escrow_liberado_em: string | null;
}

export interface DadosProjecao {
  saldoAtual: number;
  hoje: string;
  contas: (ContaParaProjecao & { referencia_pedido_marketplace_id?: string | null })[];
  parcelas: ParcelaCrua[];
  despesasFixas: DespesaFixaFonte[];
  pagamentosFixas: PagamentoDespesaFixa[];
  /** Contas a pagar do mês, de QUALQUER status: uma fixa já paga por conta a pagar não conta de novo. Sem isso, vale `contas`. */
  contasExistentes?: ContaExistente[];
  /** Por id do pedido (`referencia_pedido_marketplace_id`). */
  pedidos: Map<string, PedidoMkt>;
  /** Prazo de liberação por loja (0089); sem entrada, vale o padrão. */
  diasPorLoja?: Record<string, number>;
  /** Fatura em aberto dos cartões (0092), como saída no vencimento. `saldoAtual` já vem sem o cartão. */
  faturas?: { valor: number; data_vencimento: string }[];
}

/** Repasse concluído (não aguardando) ainda por receber, com a data prevista. */
export function repassesConcluidos(contas: DadosProjecao["contas"], pedidos: DadosProjecao["pedidos"], diasPorLoja: Record<string, number> = {}) {
  const saida: { id?: string; valor: number; previsto: string; lojaId: string | null }[] = [];
  for (const c of contas as (ContaParaProjecao & { id?: string })[]) {
    if (c.tipo !== "receber" || c.status !== "pendente" || c.aguardando_liberacao || !eRepasseMarketplace(c)) continue;
    const valor = restanteParcela({ status: c.status, valor: Number(c.valor), valor_pago: Number(c.valor_pago ?? 0) });
    if (valor <= 0.004) continue;
    const pedido = c.referencia_pedido_marketplace_id ? pedidos.get(c.referencia_pedido_marketplace_id) : undefined;
    // `??`, não `||`: 0 dia é um prazo válido (a plataforma libera na hora).
    const dias = (pedido?.loja_id ? diasPorLoja[pedido.loja_id] : undefined) ?? DIAS_LIBERACAO_PADRAO;
    saida.push({ id: c.id, valor, lojaId: pedido?.loja_id ?? null, previsto: previsaoRepasse(c.data_vencimento, pedido?.escrow_liberado_em, dias) });
  }
  return saida;
}

export function montarEntradaProjecao(d: DadosProjecao): EntradaProjecao {
  // As fixas do mês corrente e do seguinte cobrem a projeção de 30 dias que atravessa o mês.
  const fixas = ocorrenciasDespesasFixas(
    d.despesasFixas,
    inicioDoMes(d.hoje),
    fimDoMes(somarDiasIso(d.hoje, 30)),
    d.pagamentosFixas,
    d.contasExistentes ?? d.contas.map((c) => ({ tipo: c.tipo, descricao: c.descricao ?? "", data_vencimento: c.data_vencimento })),
  ).map((o) => ({ valor: o.valor, data_vencimento: o.data_vencimento, paga: o.paga }));

  return {
    saldoAtual: d.saldoAtual,
    hoje: d.hoje,
    contas: [
      ...d.contas,
      ...(d.faturas ?? []).map((f) => ({ tipo: "pagar" as const, status: "pendente", valor: f.valor, valor_pago: 0, data_vencimento: f.data_vencimento, descricao: "Fatura do cartão" })),
    ],
    parcelas: d.parcelas.filter((p) => p.vendas?.status !== "cancelada" && p.status !== "cancelada").map((p) => ({ status: p.status, valor: p.valor, valor_pago: p.valor_pago, data_vencimento: p.data_vencimento })),
    fixas,
    repasses: repassesConcluidos(d.contas, d.pedidos, d.diasPorLoja).map((r) => ({ valor: r.valor, previsto: r.previsto })),
  };
}
