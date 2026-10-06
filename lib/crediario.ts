/**
 * Encargos do crediário atrasado: multa (uma vez) + juros simples pro rata dia, sobre o que
 * falta pagar. Os percentuais vêm de Configurações → Conta (0065). PURO, coberto por
 * `crediario.test.ts`.
 *
 * Multa de atraso é limitada a 2% pelo Código de Defesa do Consumidor (art. 52, §1º); o
 * banco também recusa mais que isso.
 */

export interface RegraEncargos {
  multaPct: number;
  jurosMesPct: number;
}

export interface Encargos {
  dias: number;
  multa: number;
  juros: number;
  total: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Dias corridos entre duas datas yyyy-mm-dd (negativo = ainda não venceu). */
function diasDeAtraso(vencimento: string, hoje: string): number {
  const d = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((d(hoje) - d(vencimento.slice(0, 10))) / 86_400_000);
}

export function encargosAtraso(valor: number, vencimento: string, hoje: string, regra: RegraEncargos | null | undefined): Encargos {
  const dias = Math.max(0, diasDeAtraso(vencimento, hoje));
  const multaPct = Math.min(2, Math.max(0, regra?.multaPct ?? 0));
  const jurosMesPct = Math.max(0, regra?.jurosMesPct ?? 0);
  if (dias === 0 || valor <= 0) return { dias, multa: 0, juros: 0, total: centavos(Math.max(0, valor)) };
  const multa = centavos((valor * multaPct) / 100);
  const juros = centavos((valor * (jurosMesPct / 100) * dias) / 30);
  return { dias, multa, juros, total: centavos(valor + multa + juros) };
}

/** A loja cobra encargos? (para não mostrar "multa R$ 0,00" quando está tudo zerado). */
export function cobraEncargos(regra: RegraEncargos | null | undefined): boolean {
  return !!regra && (regra.multaPct > 0 || regra.jurosMesPct > 0);
}
