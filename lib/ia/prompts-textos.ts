/**
 * Prompts das ferramentas de texto da Vixe (7.7): responder cliente, cobrança de fiado,
 * legenda para rede social e ficha técnica. Todos devolvem JSON pequeno, lido por
 * `interpretarTexto` / `interpretarAtributos`, que nunca lançam.
 */

import { formatBRL } from "@/lib/format";
import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export type FerramentaTexto = "resposta" | "cobranca" | "legenda" | "atributos";

export interface ProdutoTextoIA {
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  preco?: number | null;
  garantiaDias?: number | null;
  emEstoque?: boolean | null;
}

export interface ContextoResposta {
  produto: ProdutoTextoIA;
  pergunta: string;
  nomeNegocio?: string | null;
}

/**
 * Sem nome do cliente, de propósito: a Política de Privacidade promete que dado de cliente
 * não vai para a IA. O modelo escreve com a marca `[NOME]`, trocada no navegador por
 * `preencherNome`.
 */
export interface ContextoCobranca {
  parcelas: { valor: number; vencimento: string; atrasoDias: number }[];
  nomeNegocio?: string | null;
  tom: "gentil" | "firme";
}

export interface ContextoLegenda {
  produto: ProdutoTextoIA;
  rede: "whatsapp" | "instagram";
  linkVitrine?: string | null;
  instrucaoExtra?: string | null;
}

export interface ContextoAtributos {
  produto: ProdutoTextoIA;
}

export const LIMITE_TEXTO: Record<Exclude<FerramentaTexto, "atributos">, number> = {
  resposta: 600,
  cobranca: 600,
  legenda: 1500,
};

const REGRAS = [
  "Escreva em português do Brasil, natural, sem soar robô.",
  "Use SOMENTE as informações fornecidas. Não invente medida, material, prazo, frete, estoque, garantia nem promoção.",
  "Sem markdown, sem HTML.",
].join("\n");

function blocoProduto(p: ProdutoTextoIA): string {
  const garantia = p.garantiaDias && p.garantiaDias > 0 ? `${p.garantiaDias} dias` : null;
  return linhas([
    ["Produto", limparCampo(p.nome, 200)],
    ["Categoria", limparCampo(p.categoria, 60)],
    ["Preço", p.preco != null && p.preco > 0 ? formatBRL(p.preco) : null],
    ["Garantia", garantia],
    ["Disponibilidade", p.emEstoque == null ? null : p.emEstoque ? "em estoque" : "sem estoque no momento"],
    ["Descrição", limparCampo(p.descricao, 1200)],
  ]);
}

export function montarPromptResposta(ctx: ContextoResposta): string {
  return `Você responde perguntas de compradores em nome de uma loja brasileira${ctx.nomeNegocio ? ` (${limparCampo(ctx.nomeNegocio, 80)})` : ""}.

${blocoProduto(ctx.produto)}

Pergunta do comprador: ${limparCampo(ctx.pergunta, 500)}

Responda em JSON com "texto": a resposta pronta para colar, cordial e objetiva, até ${LIMITE_TEXTO.resposta} caracteres.
- Se a informação não estiver acima, diga com educação que vai confirmar e responder em seguida. Não chute.
- Não prometa prazo de entrega nem frete.
${REGRAS}`;
}

export function montarPromptCobranca(ctx: ContextoCobranca): string {
  const lista = ctx.parcelas
    .slice(0, 12)
    .map((p) => `- ${formatBRL(p.valor)}, vencida em ${p.vencimento}${p.atrasoDias > 0 ? ` (${p.atrasoDias} dias de atraso)` : ""}`)
    .join("\n");
  const total = ctx.parcelas.reduce((s, p) => s + p.valor, 0);
  const tom =
    ctx.tom === "firme"
      ? "Tom firme e respeitoso: deixe claro que precisa do acerto e peça uma data."
      : "Tom gentil, como um lembrete entre conhecidos.";
  return `Você escreve uma mensagem de WhatsApp de uma loja${ctx.nomeNegocio ? ` (${limparCampo(ctx.nomeNegocio, 80)})` : ""} para um cliente que comprou fiado.

Parcelas em aberto:
${lista}
Total em aberto: ${formatBRL(total)}

Responda em JSON com "texto": a mensagem pronta, até ${LIMITE_TEXTO.cobranca} caracteres.
- ${tom}
- Chame o cliente de [NOME], exatamente assim, entre colchetes (o sistema troca pelo nome depois). Ofereça facilitar (Pix, dividir) sem inventar desconto.
- Nunca ameace, não fale de nome sujo, protesto, juros ou cobrança judicial.
- Não use emoji.
${REGRAS}`;
}

export function montarPromptLegenda(ctx: ContextoLegenda): string {
  const rede =
    ctx.rede === "instagram"
      ? "uma legenda de Instagram: primeira linha que prende, 2 a 4 frases, chamada para ação, e de 5 a 10 hashtags em português no campo hashtags."
      : "uma mensagem de WhatsApp para status ou lista de transmissão: curta, com chamada para ação. Deixe hashtags vazio.";
  return `Você escreve divulgação de produto para uma pequena loja brasileira.

${blocoProduto(ctx.produto)}
${ctx.linkVitrine ? `Link da loja: ${limparCampo(ctx.linkVitrine, 200)}\n` : ""}${ctx.instrucaoExtra ? `Pedido do vendedor: ${limparCampo(ctx.instrucaoExtra, 300)}\n` : ""}
Escreva ${rede}
Responda em JSON com "texto" (até ${LIMITE_TEXTO.legenda} caracteres${ctx.linkVitrine ? ", terminando com o link" : ""}) e "hashtags" (lista).
- Pode usar no máximo 3 emojis.
- Só cite o preço se ele foi informado.
${REGRAS}`;
}

export function montarPromptAtributos(ctx: ContextoAtributos): string {
  return `Extraia a ficha técnica de um produto a partir do que o vendedor escreveu.

${blocoProduto(ctx.produto)}

Responda em JSON com "atributos": lista de { "nome", "valor" } (ex.: Material: Algodão; Cor: Azul; Dimensões: 20 x 10 cm), no máximo 15.
- Só o que está ESCRITO acima. Se não houver nenhum atributo, devolva lista vazia.
- Nome até 40 caracteres, valor até 80.
${REGRAS}`;
}

export function esquemaTexto(comHashtags: boolean) {
  return {
    type: "object",
    properties: {
      texto: { type: "string" },
      ...(comHashtags ? { hashtags: { type: "array", items: { type: "string" } } } : {}),
    },
    required: ["texto"],
  };
}

export function esquemaAtributos() {
  return {
    type: "object",
    properties: {
      atributos: {
        type: "array",
        items: { type: "object", properties: { nome: { type: "string" }, valor: { type: "string" } }, required: ["nome", "valor"] },
      },
    },
    required: ["atributos"],
  };
}

export interface TextoGerado {
  texto: string;
  hashtags: string[];
}

export function interpretarTexto(bruto: string, limite: number): TextoGerado {
  const obj = lerObjetoJson(bruto);
  const cru = typeof obj?.texto === "string" ? obj.texto : obj ? "" : bruto;
  const texto = truncarEmPalavra(cru.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(), limite);
  const hashtags: string[] = [];
  for (const h of Array.isArray(obj?.hashtags) ? obj.hashtags : []) {
    if (typeof h !== "string") continue;
    const limpa = h.replace(/[^\p{L}\p{N}_]/gu, "");
    if (limpa && !hashtags.includes(limpa.toLowerCase())) hashtags.push(limpa.toLowerCase());
    if (hashtags.length >= 10) break;
  }
  return { texto, hashtags };
}

export function interpretarAtributos(bruto: string): { nome: string; valor: string }[] {
  const obj = lerObjetoJson(bruto);
  const saida: { nome: string; valor: string }[] = [];
  for (const a of Array.isArray(obj?.atributos) ? obj.atributos : []) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const nome = typeof r.nome === "string" ? truncarEmPalavra(r.nome.replace(/\s+/g, " ").trim(), 40) : "";
    const valor = typeof r.valor === "string" ? truncarEmPalavra(r.valor.replace(/\s+/g, " ").trim(), 80) : "";
    if (!nome || !valor) continue;
    saida.push({ nome, valor });
    if (saida.length >= 15) break;
  }
  return saida;
}

/** Troca a marca `[NOME]` pelo primeiro nome do cliente, já no navegador. */
export function preencherNome(texto: string, nomeCompleto: string | null): string {
  const primeiro = nomeCompleto?.trim().split(/\s+/)[0] ?? "";
  // Sem nome cadastrado, a marca some junto com a vírgula que a antecede ("Oi, [NOME]!" → "Oi!").
  return primeiro ? texto.replace(/\[NOME\]/gi, primeiro) : texto.replace(/,?\s*\[NOME\]/gi, "");
}

/** Hash do cache: ferramenta + todo o contexto serializado (é pequeno). */
export function hashFerramenta(ferramenta: FerramentaTexto, ctx: unknown): string {
  return hashTexto(`${ferramenta}-v1\u0001${JSON.stringify(ctx)}`);
}
