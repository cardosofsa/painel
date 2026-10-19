/**
 * Anúncios da própria loja como exemplo para a IA (0109). Puro, coberto por
 * `exemplos-loja.test.ts`: quais itens ler e o que vira linha de `marca_exemplos`.
 */

import type { LinhaRanking } from "@/lib/marketplace/ranking-anuncios";
import type { TextoAnuncio } from "@/lib/marketplace/shopee-api";

/** Quantos anúncios a leitura traz: os que mais vendem dizem mais sobre o estilo que funciona. */
export const ANUNCIOS_LIDOS = 8;
/** Descrição menor que isto não ensina nada (e a Shopee nem aceita). */
const MINIMO_DESCRICAO = 100;

/**
 * Os itens a ler, dos que mais venderam para os menos; se a loja tem poucas vendas, completa
 * com os demais anúncios cadastrados. Um item só uma vez (variações são o mesmo texto).
 */
export function itensParaLer(linhas: readonly Pick<LinhaRanking, "anuncioId" | "unidades">[], anuncios: readonly { id: string; item_id: number }[], quantos = ANUNCIOS_LIDOS): number[] {
  const itemDoAnuncio = new Map(anuncios.map((a) => [a.id, Number(a.item_id)]));
  const escolhidos: number[] = [];
  const pegar = (item: number | undefined) => {
    if (item && Number.isFinite(item) && !escolhidos.includes(item) && escolhidos.length < quantos) escolhidos.push(item);
  };
  for (const l of [...linhas].filter((x) => x.unidades > 0).sort((a, b) => b.unidades - a.unidades)) pegar(l.anuncioId ? itemDoAnuncio.get(l.anuncioId) : undefined);
  for (const a of anuncios) pegar(Number(a.item_id));
  return escolhidos;
}

export interface LinhaExemplo {
  perfil_id: string;
  tipo: "titulo" | "descricao";
  origem: "loja";
  texto: string;
  referencia: string;
}

/** O que a leitura grava: todo título e as descrições com tamanho de descrição de verdade. */
export function linhasDeExemplo(perfilId: string, textos: readonly TextoAnuncio[]): LinhaExemplo[] {
  const linhas: LinhaExemplo[] = [];
  for (const t of textos) {
    const referencia = String(t.itemId);
    const titulo = t.titulo.replace(/\s+/g, " ").trim();
    if (titulo.length >= 10) linhas.push({ perfil_id: perfilId, tipo: "titulo", origem: "loja", texto: titulo.slice(0, 5000), referencia });
    const descricao = t.descricao?.replace(/\r\n?/g, "\n").trim() ?? "";
    if (descricao.length >= MINIMO_DESCRICAO) linhas.push({ perfil_id: perfilId, tipo: "descricao", origem: "loja", texto: descricao.slice(0, 5000), referencia });
  }
  return linhas;
}
