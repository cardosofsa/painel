/**
 * Montagem do anúncio para a Shopee (Fase 2): checklist do que a Shopee premia/exige,
 * hashtags e o texto pronto para colar. Puro, coberto por `anuncio-shopee.test.ts`.
 *
 * Limites da Shopee Brasil usados aqui: título até 120 caracteres, descrição até 3.000,
 * até 9 fotos (a primeira é a capa), até 18 hashtags; peso e medidas são obrigatórios
 * para o frete.
 */

import { avaliarTitulo } from "./ia/nota-titulo";
import { formatBRL } from "./format";

export const LIMITE_TITULO_SHOPEE = 120;
export const LIMITE_DESCRICAO_SHOPEE = 3000;
export const MAX_FOTOS_SHOPEE = 9;
export const MAX_HASHTAGS_SHOPEE = 18;

export interface AnuncioRascunho {
  titulo: string;
  descricao: string;
  preco: number | null;
  sku: string | null;
  fotos: string[];
  palavrasChave: string[];
  pesoG: number | null;
  medidas: { altura: number | null; largura: number | null; comprimento: number | null };
  /** Nome do produto (termo principal para a nota do título). */
  produtoNome: string;
}

export interface ItemChecklist {
  ok: boolean;
  texto: string;
  /** Vale como aviso, não como bloqueio. */
  recomendado?: boolean;
}

export function hashtags(palavras: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const p of palavras) {
    const tag = p
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (tag.length < 2 || vistos.has(tag)) continue;
    vistos.add(tag);
    saida.push(`#${tag}`);
    if (saida.length >= MAX_HASHTAGS_SHOPEE) break;
  }
  return saida;
}

export function checklistAnuncio(a: AnuncioRascunho): { itens: ItemChecklist[]; notaTitulo: number; pronto: boolean } {
  const nota = avaliarTitulo(a.titulo, { limite: LIMITE_TITULO_SHOPEE, termoPrincipal: a.produtoNome });
  const itens: ItemChecklist[] = [
    { ok: a.titulo.trim().length >= 25 && a.titulo.length <= LIMITE_TITULO_SHOPEE, texto: `Título entre 25 e ${LIMITE_TITULO_SHOPEE} caracteres (${a.titulo.length})` },
    { ok: nota.nota >= 75, texto: `Título com nota ${nota.nota}/100`, recomendado: true },
    { ok: a.descricao.trim().length >= 100 && a.descricao.length <= LIMITE_DESCRICAO_SHOPEE, texto: `Descrição entre 100 e ${LIMITE_DESCRICAO_SHOPEE.toLocaleString("pt-BR")} caracteres (${a.descricao.length})` },
    { ok: a.preco !== null && a.preco > 0, texto: a.preco ? `Preço definido: ${formatBRL(a.preco)}` : "Preço definido" },
    { ok: a.fotos.length >= 1, texto: "Pelo menos 1 foto (a capa)" },
    { ok: a.fotos.length >= 5, texto: `5 ou mais fotos (${Math.min(a.fotos.length, MAX_FOTOS_SHOPEE)} de ${MAX_FOTOS_SHOPEE})`, recomendado: true },
    { ok: !!a.pesoG, texto: "Peso preenchido (obrigatório para o frete)" },
    { ok: !!(a.medidas.altura && a.medidas.largura && a.medidas.comprimento), texto: "Medidas da embalagem preenchidas" },
    { ok: !!a.sku?.trim(), texto: "SKU preenchido (liga o anúncio ao estoque)", recomendado: true },
  ];
  return { itens, notaTitulo: nota.nota, pronto: itens.every((i) => i.ok || i.recomendado) };
}

/** Tudo num texto só, na ordem em que a Shopee pede. */
export function textoAnuncio(a: AnuncioRascunho): string {
  const partes = [a.titulo.trim()];
  if (a.preco) partes.push(`Preço: ${formatBRL(a.preco)}`);
  if (a.descricao.trim()) partes.push(a.descricao.trim());
  const tags = hashtags(a.palavrasChave);
  if (tags.length) partes.push(tags.join(" "));
  if (a.sku?.trim()) partes.push(`SKU: ${a.sku.trim()}`);
  return partes.join("\n\n");
}
