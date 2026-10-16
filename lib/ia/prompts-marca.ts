/**
 * "Aprender das minhas capas": a IA olha uma montagem das capas da loja e PROPÕE uma Ficha de
 * Direção de Arte e algumas observações de padrão. Puro, coberto por `prompts-marca.test.ts`.
 *
 * A IA descreve só o que enxerga: o que não aparece nas imagens fica vazio (não vira palpite).
 * Nada é gravado: o usuário revisa campo a campo antes de salvar a primeira versão da ficha.
 * Sem regra de nicho: o nicho, se existir, é só o texto livre que o usuário digitou.
 */

import { normalizarFicha, type FichaMarca } from "@/lib/marca/ficha";
import { hashTexto, lerObjetoJson, limparCampo, truncarEmPalavra } from "./texto";

export interface ContextoMarca {
  /** Nome da plataforma ("Shopee"...), só para a IA entender o formato de capa esperado. */
  plataforma: string;
  /** Texto livre do usuário; opcional. */
  nicho: string | null;
  /** Quantas capas estão na montagem (a IA não deve inventar mais). */
  capas: number;
}

export interface MemoriaProposta {
  tipo: "preferencia" | "regra" | "aprendizado";
  texto: string;
}

export interface PropostaMarca {
  resumo: string;
  ficha: FichaMarca;
  memorias: MemoriaProposta[];
}

export function montarPromptMarca(c: ContextoMarca): string {
  return [
    `Você é diretor de arte de anúncios para marketplaces brasileiros (${limparCampo(c.plataforma, 40) ?? "marketplace"}).`,
    `A imagem é uma MONTAGEM com ${c.capas} capa${c.capas === 1 ? "" : "s"} de anúncios da mesma loja. Descubra o padrão visual que se repete entre elas.`,
    c.nicho ? `O lojista descreveu o que vende como: "${limparCampo(c.nicho, 120)}". Use só como contexto.` : "",
    "",
    "Responda em JSON com:",
    '- "resumo": 1 a 2 frases sobre o padrão visual que você enxerga (até 300 caracteres).',
    '- "ficha": os campos abaixo, preenchidos SOMENTE quando dá para ver nas imagens; deixe de fora o que não se vê.',
    '    fundo (até 120), luz (até 120), enquadramento do produto (até 160), areaProdutoMinPct (número 10 a 100, quanto da imagem o produto ocupa),',
    '    paleta (até 6 cores aproximadas no formato "#RRGGBB"), tipografia (estilo da letra, até 120), tituloMaxPalavras (inteiro 1 a 12),',
    '    selos (até 4 textos curtos de diferenciais que se repetem), faixaInferior (descrição de faixa/rodapé, até 120),',
    '    logoPosicao ("inferior_direito", "inferior_esquerdo", "superior_direito", "superior_esquerdo" ou "nenhuma"), logoLarguraPct (número 3 a 25),',
    '    pessoas ("nao", "opcional" ou "sim"), tom (até 120), observacoes (até 400).',
    '- "memorias": de 0 a 4 observações curtas do que se repete (cada uma com "tipo": "preferencia" | "regra" | "aprendizado" e "texto" até 160 caracteres).',
    "",
    "Regras:",
    "- Descreva apenas o que está visível. Não invente cor, texto, logo, selo nem medida que não aparece.",
    "- Não copie o texto das imagens como se fosse promessa; em selos, só diferenciais que se repetem.",
    "- Se as imagens não parecerem capas de anúncio, devolva ficha vazia e explique no resumo.",
    "- Sem emoji, sem markdown, sem HTML.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

export function esquemaMarca(): object {
  const lista = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      resumo: { type: "string" },
      ficha: {
        type: "object",
        properties: {
          fundo: { type: "string" },
          luz: { type: "string" },
          enquadramento: { type: "string" },
          areaProdutoMinPct: { type: "number" },
          paleta: lista,
          tipografia: { type: "string" },
          tituloMaxPalavras: { type: "integer" },
          selos: lista,
          faixaInferior: { type: "string" },
          logoPosicao: { type: "string" },
          logoLarguraPct: { type: "number" },
          pessoas: { type: "string" },
          tom: { type: "string" },
          observacoes: { type: "string" },
        },
      },
      memorias: {
        type: "array",
        items: { type: "object", properties: { tipo: { type: "string" }, texto: { type: "string" } }, required: ["texto"] },
      },
    },
    required: ["resumo", "ficha", "memorias"],
  };
}

const TIPOS_MEMORIA = ["preferencia", "regra", "aprendizado"] as const;

/** Lê a resposta e devolve algo seguro para a tela. Nunca lança; campo ruim vira vazio. */
export function interpretarMarca(bruto: string): PropostaMarca {
  const obj = lerObjetoJson(bruto) ?? {};
  const memorias: MemoriaProposta[] = [];
  for (const m of Array.isArray(obj.memorias) ? obj.memorias : []) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const texto = typeof r.texto === "string" ? truncarEmPalavra(r.texto.replace(/\s+/g, " ").trim(), 160) : "";
    if (texto.length < 3) continue;
    const tipo = TIPOS_MEMORIA.find((t) => t === r.tipo) ?? "aprendizado";
    memorias.push({ tipo, texto });
    if (memorias.length >= 4) break;
  }
  const ficha = normalizarFicha(obj.ficha);
  // `numeroImagens` e `proibicoes` são decisões do usuário, não se tiram de uma foto.
  delete ficha.numeroImagens;
  delete ficha.proibicoes;
  return {
    resumo: typeof obj.resumo === "string" ? truncarEmPalavra(obj.resumo.replace(/\s+/g, " ").trim(), 300) : "",
    ficha,
    memorias,
  };
}

/** Sem ficha e sem observação aproveitável: o modelo falhou ou as imagens não eram capas. */
export const propostaVazia = (p: PropostaMarca) => Object.keys(p.ficha).length === 0 && p.memorias.length === 0;

/** O cache é pelos bytes da montagem mais o contexto. */
export function hashMarca(hashImagem: string, c: ContextoMarca): string {
  return hashTexto(["marca-v1", hashImagem, c.plataforma, c.nicho ?? "", String(c.capas)].join("\u0001"));
}
