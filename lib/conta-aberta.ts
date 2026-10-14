/**
 * Conta em aberto com o fornecedor (0095): extrato de compras e dívida antiga (sobem o saldo)
 * e pagamentos (descem). PURO, coberto por `conta-aberta.test.ts`. O banco é a fonte da
 * verdade do saldo; aqui fica só o que a tela calcula para mostrar o extrato.
 */

export type TipoLancamento = "compra" | "divida_antiga" | "pagamento";

export interface LancamentoFornecedor {
  id: string;
  tipo: TipoLancamento;
  valor: number;
  /** AAAA-MM-DD. */
  data: string;
  descricao: string | null;
  criado_em: string;
}

export const ROTULO_LANCAMENTO: Record<TipoLancamento, string> = {
  compra: "Compra em aberto",
  divida_antiga: "Dívida antiga",
  pagamento: "Pagamento",
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Pagamento desce o saldo; compra e dívida antiga sobem. */
export const valorComSinal = (l: Pick<LancamentoFornecedor, "tipo" | "valor">) => (l.tipo === "pagamento" ? -l.valor : l.valor);

export function saldoDoExtrato(lancamentos: readonly Pick<LancamentoFornecedor, "tipo" | "valor">[]): number {
  return centavos(lancamentos.reduce((s, l) => s + valorComSinal(l), 0));
}

/**
 * Extrato do mais recente para o mais antigo, cada linha com o saldo DEPOIS dela. A ordem de
 * cálculo é a cronológica (data, depois criação); a de exibição é a inversa.
 */
export function extratoComSaldo<T extends LancamentoFornecedor>(lancamentos: readonly T[]): (T & { saldoApos: number })[] {
  const cronologico = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id));
  let corrente = 0;
  const comSaldo = cronologico.map((l) => {
    corrente = centavos(corrente + valorComSinal(l));
    return { ...l, saldoApos: corrente };
  });
  return comSaldo.reverse();
}
