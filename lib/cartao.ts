/**
 * Cartão de crédito como tipo de conta (0092). No cartão, `saldo` guarda a dívida em negativo:
 * o gasto reduz o saldo como em qualquer conta, e o limite disponível é `limite + saldo`.
 * O cartão fica FORA do saldo de caixa; o dinheiro só sai quando a fatura é paga.
 */
export interface ContaTipada {
  saldo: number;
  tipo?: string | null;
  limite_total?: number | null;
}

export function ehCartao(c: { tipo?: string | null }): boolean {
  return c.tipo === "cartao_credito";
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Fatura em aberto (valor positivo). */
export function dividaCartao(c: ContaTipada): number {
  return centavos(Math.max(0, -c.saldo));
}

/** Limite ainda livre para gastar (nunca negativo). */
export function limiteDisponivel(c: ContaTipada): number {
  return centavos(Math.max(0, (c.limite_total ?? 0) + c.saldo));
}

/** Percentual do limite usado, de 0 a 100. */
export function percentualUsado(c: ContaTipada): number {
  const limite = c.limite_total ?? 0;
  if (limite <= 0) return 0;
  return Math.min(100, Math.max(0, (dividaCartao(c) / limite) * 100));
}

/** Soma só o que é dinheiro de verdade: cartão não entra. */
export function saldoDeCaixa(contas: ContaTipada[]): number {
  return centavos(contas.filter((c) => !ehCartao(c)).reduce((a, c) => a + c.saldo, 0));
}

/** Soma das faturas em aberto de todos os cartões. */
export function dividaTotalCartoes(contas: ContaTipada[]): number {
  return centavos(contas.filter(ehCartao).reduce((a, c) => a + dividaCartao(c), 0));
}

const comZero = (n: number) => String(n).padStart(2, "0");

/** Próxima data (AAAA-MM-DD) em que cai o dia `dia`, de hoje em diante; mês curto usa o último dia. */
export function proximoVencimento(dia: number, hoje: string): string {
  const [a, m] = hoje.split("-").map(Number);
  const noMes = (ano: number, mes: number) => {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${comZero(mes)}-${comZero(Math.min(dia, ultimo))}`;
  };
  const esteMes = noMes(a, m);
  if (esteMes >= hoje) return esteMes;
  return m === 12 ? noMes(a + 1, 1) : noMes(a, m + 1);
}

export interface CartaoParaFatura extends ContaTipada {
  dia_vencimento?: number | null;
}

/** Fatura em aberto de cada cartão como saída prevista no próximo vencimento (sem dia cadastrado, entra hoje). */
export function faturasParaProjecao(contas: CartaoParaFatura[], hoje: string): { valor: number; data_vencimento: string }[] {
  return contas
    .filter((c) => ehCartao(c) && dividaCartao(c) > 0)
    .map((c) => ({ valor: dividaCartao(c), data_vencimento: c.dia_vencimento ? proximoVencimento(c.dia_vencimento, hoje) : hoje }));
}
