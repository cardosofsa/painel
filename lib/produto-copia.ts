/**
 * Duplicar produto: a cópia nasce no formulário de cadastro e só vira produto quando o dono
 * salvar. PURO, coberto por `produto-copia.test.ts`.
 *
 * Mantém o que descreve o produto (insumos, preço, medidas, categoria…) e zera ou ajusta o que o
 * banco exige único (SKU, código de barras, rótulo de variante do mesmo grupo) ou que seria
 * mentira numa unidade nova (estoque, saída média).
 */

export const SUFIXO_SKU_COPIA = "-COPIA";
export const SUFIXO_NOME_COPIA = " (cópia)";

export interface CampoCopiavel {
  nome: string;
  sku: string;
  codigo_barras: string | null;
  estoque: number;
  saida_media_semanal: number;
  grupo_id: string | null;
  variante_nome: string | null;
}

/** Produto de partida → dados do formulário de cadastro. Não altera o original. */
export function dadosDaCopia<T extends CampoCopiavel>(p: T): T {
  const naGrupoComVariante = !!p.grupo_id && !!p.variante_nome?.trim();
  return {
    ...p,
    nome: `${p.nome.trim()}${SUFIXO_NOME_COPIA}`,
    sku: `${p.sku.trim()}${SUFIXO_SKU_COPIA}`,
    // Único por produto (o leitor do PDV tem que achar exatamente um).
    codigo_barras: null,
    // Não existe a unidade física da cópia, e a saída média é história do original.
    estoque: 0,
    saida_media_semanal: 0,
    // Duas variantes do mesmo grupo não podem ter o mesmo rótulo.
    variante_nome: naGrupoComVariante ? `${p.variante_nome!.trim()}${SUFIXO_NOME_COPIA}` : p.variante_nome,
  };
}
