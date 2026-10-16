/**
 * O que o assistente sabe de cada plataforma, para a PRIMEIRA pergunta do perfil de marca
 * ("para qual plataforma?"). PURO, coberto por `plataformas.test.ts`.
 *
 * Limites de título e descrição vêm de `lib/marketplace/plataformas.ts` (a fonte única do
 * Painel). O resto são orientações gerais de imagem: servem de ponto de partida e a tela
 * manda confirmar na central do vendedor, porque cada plataforma muda as regras.
 */

import { PLATAFORMAS } from "@/lib/marketplace/plataformas";
import { PLATAFORMAS_MARCA_IDS } from "@/lib/validacao";

export type PlataformaMarcaId = (typeof PLATAFORMAS_MARCA_IDS)[number];

export interface RegrasPlataforma {
  id: PlataformaMarcaId;
  nome: string;
  limiteTitulo: number | null;
  limiteDescricao: number | null;
  /** Máximo de imagens por anúncio, quando o Painel já sabe. */
  maxImagens: number | null;
  /** Proporção usual das imagens. */
  proporcao: "1:1" | null;
  /** Lado recomendado, em pixels. */
  ladoRecomendadoPx: number | null;
  /** A primeira imagem costuma exigir fundo branco. */
  capaFundoBranco: boolean;
  /** Frases curtas para o usuário conferir na central do vendedor. */
  notas: string[];
}

const NOTA_CONFIRA = "Confira sempre as regras atuais na central do vendedor da plataforma.";

const ESPECIFICOS: Partial<Record<PlataformaMarcaId, Omit<RegrasPlataforma, "id" | "nome" | "limiteTitulo" | "limiteDescricao">>> = {
  shopee: { maxImagens: 9, proporcao: "1:1", ladoRecomendadoPx: 1024, capaFundoBranco: false, notas: ["Imagens quadradas (1:1) funcionam melhor na grade de busca.", NOTA_CONFIRA] },
  mercadolivre: { maxImagens: null, proporcao: null, ladoRecomendadoPx: null, capaFundoBranco: true, notas: ["A primeira imagem costuma exigir fundo branco e o produto em destaque.", NOTA_CONFIRA] },
  amazon: { maxImagens: null, proporcao: null, ladoRecomendadoPx: 1000, capaFundoBranco: true, notas: ["A imagem principal costuma exigir fundo branco.", NOTA_CONFIRA] },
};

const NOMES_EXTRA: Record<string, string> = { outra: "Outra plataforma" };

export function regrasDaPlataforma(id: PlataformaMarcaId): RegrasPlataforma {
  const p = PLATAFORMAS.find((x) => x.id === id);
  const e = ESPECIFICOS[id];
  return {
    id,
    nome: p?.nome ?? NOMES_EXTRA[id] ?? id,
    limiteTitulo: p?.canal.limite_titulo ?? null,
    limiteDescricao: p?.canal.limite_descricao ?? null,
    maxImagens: e?.maxImagens ?? null,
    proporcao: e?.proporcao ?? null,
    ladoRecomendadoPx: e?.ladoRecomendadoPx ?? null,
    capaFundoBranco: e?.capaFundoBranco ?? false,
    notas: e?.notas ?? [NOTA_CONFIRA],
  };
}

/** Todas, na ordem da primeira pergunta do perfil: as integradas primeiro, "Outra" por último. */
export function listaDePlataformas(): RegrasPlataforma[] {
  return PLATAFORMAS_MARCA_IDS.map(regrasDaPlataforma);
}

/** Plataforma do canal já cadastrado (pelo nome), para pré-preencher; `null` se não reconhece. */
export function plataformaDoCanal(nomeCanal: string | null | undefined): PlataformaMarcaId | null {
  const n = (nomeCanal ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("shopee")) return "shopee";
  if (n.includes("mercado")) return "mercadolivre";
  if (n.includes("amazon")) return "amazon";
  if (n.includes("shein")) return "shein";
  if (n.includes("tiktok")) return "tiktok";
  if (n.includes("magalu") || n.includes("magazine")) return "magalu";
  return null;
}
