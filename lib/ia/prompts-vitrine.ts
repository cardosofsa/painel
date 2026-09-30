/**
 * Prompt do assistente de vitrine da Vixe (7.9): o dono responde segmento, público,
 * estilo, cores e diferenciais; a IA devolve o TEMA (mesmo formato de `prompts-tema.ts`,
 * lido por `interpretarTema`) mais as SEÇÕES (lidas por `normalizarSecoes`). Nada de HTML.
 */

import { FONTES_VITRINE, interpretarTema, type TemaSugerido } from "./prompts-tema";
import { hashTexto, lerObjetoJson, limparCampo, linhas } from "./texto";
import { LIMITES_SECOES, normalizarSecoes, type SecoesVitrine } from "@/lib/vixe/vitrine";

export const ESTILOS_VITRINE = ["moderno", "elegante", "rustico", "divertido", "minimalista"] as const;
export type EstiloVitrine = (typeof ESTILOS_VITRINE)[number];

export const ROTULO_ESTILO: Record<EstiloVitrine, string> = {
  moderno: "Moderno",
  elegante: "Elegante",
  rustico: "Rústico / artesanal",
  divertido: "Divertido / colorido",
  minimalista: "Minimalista",
};

export interface ContextoVitrine {
  nomeNegocio?: string | null;
  segmento: string;
  publico?: string | null;
  estilo: EstiloVitrine;
  cores?: string | null;
  diferenciais?: string | null;
  cidade?: string | null;
}

export interface VitrineSugerida {
  tema: TemaSugerido;
  secoes: SecoesVitrine;
}

export function montarPromptVitrine(ctx: ContextoVitrine): string {
  const L = LIMITES_SECOES;
  const dados = linhas([
    ["Nome do negócio", limparCampo(ctx.nomeNegocio, 120)],
    ["O que vende", limparCampo(ctx.segmento, 200)],
    ["Público", limparCampo(ctx.publico, 200)],
    ["Estilo desejado", ROTULO_ESTILO[ctx.estilo]],
    ["Cores preferidas", limparCampo(ctx.cores, 120)],
    ["Diferenciais contados pelo dono", limparCampo(ctx.diferenciais, 500)],
    ["Cidade", limparCampo(ctx.cidade, 80)],
  ]);

  return `Você é a Vixe, montando a vitrine online (catálogo de produtos) de uma pequena loja brasileira.

${dados}

Responda em JSON com:
- cor_primaria, cor_fundo, cor_superficie, cor_texto: hex #RRGGBB, coerentes entre si e com o estilo. Fundo bem claro ou bem escuro, nunca tom médio. Se o dono citou cores, use-as na cor_primaria.
- fonte: uma destas, exatamente: ${FONTES_VITRINE.join(", ")}.
- titulo: nome curto para o topo (até 60 caracteres), ou null para usar o nome do negócio.
- mensagem_boas_vindas: uma frase (até 160 caracteres).
- secoes: objeto com
  - destaque: { titulo (até ${L.destaqueTitulo}), subtitulo (até ${L.destaqueSubtitulo}) } — a frase de abertura da loja;
  - sobre: { texto (até ${L.sobre}) } — quem é a loja, em 2 a 4 frases;
  - diferenciais: lista de até 3 { titulo (até ${L.diferencialTitulo}), texto (até ${L.diferencialTexto}) };
  - chamada: { texto (até ${L.chamada}) } — convite para pedir pelo WhatsApp;
  - rodape: { texto (até ${L.rodape}) }.

Regras:
- Use SOMENTE o que o dono informou. Diferencial não informado não pode ser inventado (nada de "frete grátis", "entrega em 24h", "garantia", "melhor preço" se ele não disse). Sem diferenciais informados, devolva diferenciais vazio.
- Nada de preço, desconto nem promoção.
- Texto puro: sem HTML, sem markdown, sem emoji, sem link.
- Português do Brasil, tom de acordo com o estilo.`;
}

export function esquemaVitrine() {
  const txt = { type: "string" };
  return {
    type: "object",
    properties: {
      cor_primaria: txt,
      cor_fundo: txt,
      cor_superficie: txt,
      cor_texto: txt,
      fonte: { type: "string", enum: [...FONTES_VITRINE] },
      titulo: { type: ["string", "null"] },
      mensagem_boas_vindas: { type: ["string", "null"] },
      secoes: {
        type: "object",
        properties: {
          destaque: { type: "object", properties: { titulo: txt, subtitulo: txt } },
          sobre: { type: "object", properties: { texto: txt } },
          diferenciais: { type: "array", items: { type: "object", properties: { titulo: txt, texto: txt } } },
          chamada: { type: "object", properties: { texto: txt } },
          rodape: { type: "object", properties: { texto: txt } },
        },
      },
    },
    required: ["cor_primaria", "cor_fundo", "cor_superficie", "cor_texto", "fonte", "secoes"],
  };
}

export function interpretarVitrine(bruto: string): VitrineSugerida {
  return { tema: interpretarTema(bruto), secoes: normalizarSecoes(lerObjetoJson(bruto)?.secoes) };
}

export function hashContextoVitrine(ctx: ContextoVitrine): string {
  return hashTexto(`vitrine-v1\u0001${JSON.stringify(ctx)}`);
}
