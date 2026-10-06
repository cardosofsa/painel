/**
 * Inventário (0074): a lógica pura da tela de contagem. Quem aplica e confere de verdade é
 * `aplicar_inventario` no banco (compara com o saldo do momento); aqui é a prévia.
 * Coberto por `inventario.test.ts`.
 */

export interface ProdutoInventario {
  id: string;
  nome: string;
  sku: string;
  codigo_barras: string | null;
  custo: number;
  /** Saldo no armazém escolhido (ou o total, sem armazém). */
  esperado: number;
}

export interface LinhaInventario {
  produto: ProdutoInventario;
  contado: number | null;
  /** contado − esperado; null enquanto não contado. */
  diferenca: number | null;
}

export interface ResumoInventario {
  contados: number;
  naoContados: number;
  iguais: number;
  sobras: number;
  faltas: number;
  /** Unidades a mais / a menos (positivos). */
  unidadesSobra: number;
  unidadesFalta: number;
  /** Valor a custo das diferenças (positivos). */
  valorSobra: number;
  valorFalta: number;
}

/** Leitor de código de barras ou SKU digitado: casa exato (SKU sem diferenciar maiúscula). */
export function acharProduto<T extends Pick<ProdutoInventario, "sku" | "codigo_barras">>(produtos: T[], termo: string): T | null {
  const t = termo.trim();
  if (!t) return null;
  const porCodigo = produtos.find((p) => p.codigo_barras && p.codigo_barras.trim() === t);
  if (porCodigo) return porCodigo;
  const minusculo = t.toLowerCase();
  return produtos.find((p) => p.sku.trim().toLowerCase() === minusculo) ?? null;
}

/**
 * "3*789123" ou "3x789123" conta 3 de uma vez (caixa fechada); sem prefixo, 1.
 * Devolve null quando a quantidade não é um inteiro positivo razoável.
 */
export function lerBipe(entrada: string): { quantidade: number; termo: string } | null {
  const m = entrada.trim().match(/^(\d{1,4})\s*[*xX]\s*(.+)$/);
  if (!m) return entrada.trim() ? { quantidade: 1, termo: entrada.trim() } : null;
  const quantidade = Number(m[1]);
  if (!Number.isInteger(quantidade) || quantidade <= 0) return null;
  return { quantidade, termo: m[2].trim() };
}

export function montarLinhas(produtos: ProdutoInventario[], contagem: Record<string, number>): LinhaInventario[] {
  return produtos.map((p) => {
    const c = contagem[p.id];
    const contado = typeof c === "number" && Number.isFinite(c) ? c : null;
    return { produto: p, contado, diferenca: contado === null ? null : contado - p.esperado };
  });
}

export function resumoInventario(linhas: LinhaInventario[]): ResumoInventario {
  const r: ResumoInventario = {
    contados: 0,
    naoContados: 0,
    iguais: 0,
    sobras: 0,
    faltas: 0,
    unidadesSobra: 0,
    unidadesFalta: 0,
    valorSobra: 0,
    valorFalta: 0,
  };
  for (const l of linhas) {
    if (l.diferenca === null) {
      r.naoContados++;
      continue;
    }
    r.contados++;
    const custo = Math.max(0, l.produto.custo);
    if (l.diferenca === 0) r.iguais++;
    else if (l.diferenca > 0) {
      r.sobras++;
      r.unidadesSobra += l.diferenca;
      r.valorSobra += l.diferenca * custo;
    } else {
      r.faltas++;
      r.unidadesFalta += -l.diferenca;
      r.valorFalta += -l.diferenca * custo;
    }
  }
  r.valorSobra = Math.round(r.valorSobra * 100) / 100;
  r.valorFalta = Math.round(r.valorFalta * 100) / 100;
  return r;
}

/** O que vai para `aplicar_inventario`: só o que foi contado. */
export function itensParaAplicar(contagem: Record<string, number>): { produto_id: string; contado: number }[] {
  return Object.entries(contagem)
    .filter(([, n]) => Number.isInteger(n) && n >= 0)
    .map(([produto_id, contado]) => ({ produto_id, contado }));
}
