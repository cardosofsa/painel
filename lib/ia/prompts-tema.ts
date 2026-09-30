/**
 * Prompt, esquema e leitura da resposta do TEMA DA VITRINE. Separado de `prompts.ts`
 * (texto de produto) porque aqui não se descreve um produto, se descreve uma loja, e a
 * saída não é texto: é um punhado de cores em hex mais um nome de fonte.
 */

import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

/**
 * As únicas fontes que a IA pode escolher. Lista fechada de propósito: a CSP do projeto
 * tem `font-src 'self'` (ver `lib/csp.ts`) — nada de Google Fonts em tempo de execução —
 * então a fonte só pode ser uma das que o build já empacota via `next/font`.
 */
export const FONTES_VITRINE = ["geist", "inter", "lora", "poppins"] as const;
export type FonteVitrine = (typeof FONTES_VITRINE)[number];

export interface ContextoTema {
  descricaoLoja: string;
  nomeNegocio?: string | null;
  instrucaoExtra?: string | null;
}

export interface TemaSugerido {
  corPrimaria: string;
  corFundo: string;
  corSuperficie: string;
  corTexto: string;
  fonte: FonteVitrine;
  titulo: string | null;
  mensagemBoasVindas: string | null;
}

const LIMITE_TITULO_VITRINE = 60;
const LIMITE_MENSAGEM_BOAS_VINDAS = 160;

export function montarPromptTema(ctx: ContextoTema): string {
  const linhasCtx = linhas([
    ["Nome do negócio", limparCampo(ctx.nomeNegocio, 120)],
    ["Descrição da loja (escrita pelo dono)", limparCampo(ctx.descricaoLoja, 500)],
    ["Instrução extra", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  return [
    "Você é um designer sugerindo a identidade visual de uma vitrine online de e-commerce.",
    "",
    linhasCtx,
    "",
    "Responda em JSON com:",
    "- cor_primaria: hex #RRGGBB. A cor de destaque da marca (botões, preço).",
    "- cor_fundo: hex #RRGGBB. Fundo da página. Deve ser bem claro (quase branco) ou bem",
    "  escuro (quase preto) — nunca um tom médio, que dificulta ler tudo por cima.",
    "- cor_superficie: hex #RRGGBB. Fundo dos cartões de produto, próximo de cor_fundo mas",
    "  perceptivelmente diferente (ex.: branco puro sobre um fundo quase branco).",
    "- cor_texto: hex #RRGGBB. Cor do texto principal — próxima do preto sobre fundo claro,",
    "  ou próxima do branco sobre fundo escuro. NÃO precisa já ter contraste perfeito: o",
    "  sistema ajusta a luminosidade automaticamente depois.",
    `- fonte: uma destas palavras, exatamente: ${FONTES_VITRINE.join(", ")}.`,
    `- titulo: um título curto para o topo da vitrine (até ${LIMITE_TITULO_VITRINE} caracteres). Pode ser null.`,
    `- mensagem_boas_vindas: uma frase de boas-vindas (até ${LIMITE_MENSAGEM_BOAS_VINDAS} caracteres). Pode ser null.`,
    "",
    "Regras:",
    "- As quatro cores precisam ser coerentes entre si (mesma família, tema claro OU escuro).",
    "- Não use preto puro (#000000) nem branco puro (#ffffff) para cor_texto — prefira tons",
    "  bem próximos, para o resultado não ficar duro.",
    "- Nunca cite preço, desconto ou concorrente.",
    "- Responda só o JSON, sem comentário fora dele.",
  ].join("\n");
}

export function esquemaTema() {
  return {
    type: "object",
    properties: {
      cor_primaria: { type: "string" },
      cor_fundo: { type: "string" },
      cor_superficie: { type: "string" },
      cor_texto: { type: "string" },
      fonte: { type: "string", enum: [...FONTES_VITRINE] },
      titulo: { type: ["string", "null"] },
      mensagem_boas_vindas: { type: ["string", "null"] },
    },
    required: ["cor_primaria", "cor_fundo", "cor_superficie", "cor_texto", "fonte"],
  };
}

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

/** Hex já validado, ou o `reserva` se vier fora do formato — a IA erra formato às vezes. */
function corOuReserva(valor: unknown, reserva: string): string {
  return typeof valor === "string" && HEX_VALIDO.test(valor.trim()) ? valor.trim().toLowerCase() : reserva;
}

/**
 * Lê a resposta do modelo e devolve algo que o app pode aplicar sem medo.
 *
 * Nunca lança: uma cor fora do formato cai numa cor neutra de reserva, e uma fonte fora da
 * lista fechada cai em "geist" — a mesma fonte que o resto do sistema já usa. Quem garante
 * que o RESULTADO final é legível é `derivarTokens`/`ajustarParaContraste` em
 * `lib/cores.ts`, chamado depois desta função; aqui só se garante o FORMATO.
 */
export function interpretarTema(bruto: string): TemaSugerido {
  const obj = lerObjetoJson(bruto) ?? {};

  const fonte = FONTES_VITRINE.includes(obj.fonte as FonteVitrine) ? (obj.fonte as FonteVitrine) : "geist";
  const titulo = typeof obj.titulo === "string" && obj.titulo.trim() ? truncarEmPalavra(obj.titulo.trim(), LIMITE_TITULO_VITRINE) : null;
  const mensagemBoasVindas =
    typeof obj.mensagem_boas_vindas === "string" && obj.mensagem_boas_vindas.trim()
      ? truncarEmPalavra(obj.mensagem_boas_vindas.trim(), LIMITE_MENSAGEM_BOAS_VINDAS)
      : null;

  return {
    corPrimaria: corOuReserva(obj.cor_primaria, "#3b4d1f"),
    corFundo: corOuReserva(obj.cor_fundo, "#fafafa"),
    corSuperficie: corOuReserva(obj.cor_superficie, "#ffffff"),
    corTexto: corOuReserva(obj.cor_texto, "#18181b"),
    fonte,
    titulo,
    mensagemBoasVindas,
  };
}

export function hashContextoTema(ctx: ContextoTema): string {
  const entrada = ["tema", ctx.descricaoLoja, ctx.nomeNegocio ?? "", ctx.instrucaoExtra ?? ""].join("\u0001");
  return hashTexto(entrada);
}
