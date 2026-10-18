import { numeroOuNulo } from "./format";

/** Regras do campo numérico: limites e arredondamento aplicados ao valor digitado. */
export interface RegrasNumero {
  min?: number;
  max?: number;
  /** Casas decimais (0 = inteiro). Sem valor, não arredonda. */
  casas?: number;
}

/** Aplica limites e casas ao número. */
export function ajustarNumero(n: number, { min, max, casas }: RegrasNumero): number {
  let v = n;
  if (casas !== undefined) {
    const f = 10 ** casas;
    v = casas === 0 ? Math.floor(v) : Math.round(v * f) / f;
  }
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

/** Texto digitado → número ajustado, ou `null` se vazio/inválido (o campo fica como está). */
export function interpretarDigitado(texto: string, regras: RegrasNumero): number | null {
  const n = numeroOuNulo(texto);
  return n === null ? null : ajustarNumero(n, regras);
}

/** Ao sair do campo: vazio ou inválido vira o padrão (0 se não houver). */
export function valorAoSair(texto: string, regras: RegrasNumero, padrao = 0): number {
  return interpretarDigitado(texto, regras) ?? padrao;
}

/** Número → texto exibido (vírgula decimal, para `numeroOuNulo` reler sem ambiguidade). */
export function formatarParaCampo(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

/**
 * Valor de um campo numérico que pode chegar como número (`CampoNumero`) ou como texto
 * digitado. Texto passa por `numeroOuNulo` (aceita "19,90"); vazio ou inválido vira 0.
 * Substitui o `Number(v) || 0`, que fazia "19,90" virar 0 sem aviso.
 */
export function numeroDoCampo(valor: string | number): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  return numeroOuNulo(valor) ?? 0;
}
