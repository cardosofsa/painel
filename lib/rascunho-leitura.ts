/**
 * Leitura defensiva de um rascunho guardado (`precificacao_rascunhos.dados`): o formato pode ser
 * de uma versão antiga da tela, e um campo estranho não pode quebrar a aba ao "Continuar".
 */

/** Lê um número de um rascunho guardado (o formato pode ser de uma versão antiga da tela). */
export function lerNumero(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : padrao;
}

/** Lê um texto de um rascunho guardado. */
export function lerTexto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao;
}

/** Lê um id (uuid ou nulo) de um rascunho guardado. */
export function lerId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Lê uma lista de um rascunho guardado, ficando só com os itens que passam em `valido`. */
export function lerLista<T>(v: unknown, valido: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const item = valido(x as Record<string, unknown>);
    return item ? [item] : [];
  });
}
