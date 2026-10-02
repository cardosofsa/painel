/**
 * Produto a partir da FOTO (Fase 10.7): a IA olha a imagem e sugere nome, descrição,
 * categoria (uma das que a conta já tem) e atributos. Puro e coberto por `prompts-foto.test.ts`.
 * Nada é gravado: a tela mostra a sugestão e o usuário escolhe o que usar.
 */

import { hashTexto, lerObjetoJson, truncarEmPalavra } from "./texto";

export interface ContextoFoto {
  /** Nome que o usuário já digitou (ajuda a IA a não "adivinhar" o produto errado). */
  nomeAtual: string | null;
  categorias: string[];
  limiteTitulo: number;
  limiteDescricao: number;
}

export interface ProdutoDaFoto {
  nome: string;
  descricao: string;
  categoria: string | null;
  atributos: { nome: string; valor: string }[];
}

export function montarPromptFoto(c: ContextoFoto): string {
  const cats = c.categorias.slice(0, 60);
  return [
    "Você é um especialista em cadastro de produtos para lojas brasileiras (catálogo online, Shopee, Mercado Livre).",
    "Olhe a FOTO do produto e escreva, em português do Brasil:",
    `- "nome": nome comercial claro e buscável, até ${c.limiteTitulo} caracteres (tipo do produto + atributo principal + material/cor). Sem marca que não apareça na foto.`,
    `- "descricao": descrição de venda em 2 a 4 frases curtas, até ${c.limiteDescricao} caracteres, só com o que dá para ver ou deduzir com segurança. Não invente medidas, garantia nem composição.`,
    cats.length ? `- "categoria": EXATAMENTE uma destas, ou null se nenhuma servir: ${cats.map((x) => `"${x}"`).join(", ")}.` : `- "categoria": null.`,
    '- "atributos": até 8 pares {nome, valor} visíveis na foto (ex.: Cor, Material, Estampa, Formato, Acabamento). Sem chute de tamanho.',
    c.nomeAtual ? `O lojista já chamou o produto de: "${c.nomeAtual.slice(0, 120)}". Use como referência se combinar com a foto.` : "",
    "Se a foto não mostrar um produto, devolva nome e descrição vazios.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function esquemaFoto(): object {
  return {
    type: "object",
    properties: {
      nome: { type: "string" },
      descricao: { type: "string" },
      categoria: { type: ["string", "null"] },
      atributos: {
        type: "array",
        items: { type: "object", properties: { nome: { type: "string" }, valor: { type: "string" } }, required: ["nome", "valor"] },
      },
    },
    required: ["nome", "descricao", "categoria", "atributos"],
  };
}

const limpar = (v: unknown, max: number) => (typeof v === "string" ? truncarEmPalavra(v.replace(/\s+/g, " ").trim(), max) : "");

/** Lê a resposta, respeita os limites do canal e só aceita categoria que a conta tem. */
export function interpretarFoto(bruto: string, c: Pick<ContextoFoto, "categorias" | "limiteTitulo" | "limiteDescricao">): ProdutoDaFoto {
  const obj = lerObjetoJson(bruto) ?? {};
  const cat = typeof obj.categoria === "string" ? obj.categoria.trim().toLowerCase() : "";
  const categoria = c.categorias.find((x) => x.trim().toLowerCase() === cat) ?? null;
  const atributos: { nome: string; valor: string }[] = [];
  for (const a of Array.isArray(obj.atributos) ? obj.atributos : []) {
    const r = (a ?? {}) as Record<string, unknown>;
    const nome = limpar(r.nome, 40);
    const valor = limpar(r.valor, 80);
    if (nome && valor) atributos.push({ nome, valor });
    if (atributos.length >= 8) break;
  }
  const descricao = typeof obj.descricao === "string" ? truncarEmPalavra(obj.descricao.trim(), c.limiteDescricao) : "";
  return { nome: limpar(obj.nome, c.limiteTitulo), descricao, categoria, atributos };
}

/** Cache por imagem (hash dos bytes) + contexto: a mesma foto não paga duas vezes. */
export function hashFoto(hashImagem: string, c: ContextoFoto): string {
  return hashTexto(`foto-v1\u0001${hashImagem}\u0001${JSON.stringify(c)}`);
}
