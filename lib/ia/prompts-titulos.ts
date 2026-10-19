/**
 * Títulos do estúdio de anúncios: cinco variantes por ÂNGULO, cada uma já com nota local e
 * conferência de termos. Puro, coberto por `prompts-titulos.test.ts`.
 *
 * Diferente do gerador de títulos da precificação (3 opções, sem conhecer a loja), este recebe
 * o que a loja ensinou — memória, termos que ela não quer e o limite da plataforma — e os
 * títulos de concorrentes como REFERÊNCIA (nunca para copiar). A IA escreve; a nota e a
 * conferência são determinísticas (`avaliarTitulo`, `verificarTextos`), então o que aparece
 * como "bloqueado" não depende do humor do modelo.
 */

import { avaliarTitulo, type NotaTitulo } from "./nota-titulo";
import { verificarTextos, type RegraTermo, type Violacao } from "@/lib/conformidade/termos";
import { blocoEstiloDaLoja, hashEstilo, type EstiloDaLoja } from "./estilo-loja";
import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export const VARIANTES_TITULO = 5;

export interface ContextoTitulosEstudio {
  produto: {
    nome: string;
    categoria: string | null;
    variante: string | null;
    /** Itens que acompanham (kit), já como texto curto. */
    componentes: string[];
  };
  plataforma: string;
  limite: number;
  nicho: string | null;
  /** Termos de busca que o vendedor já usa. */
  palavrasChave: string[];
  /** Preferências e regras ATIVAS da memória da loja. */
  memoria: string[];
  /** Termos que a loja não quer ver. */
  termosProibidos: string[];
  /** Títulos de concorrentes, só como referência de mercado. */
  concorrentes: { titulo: string; faixaPreco: string | null }[];
  /** Pedido livre do usuário na conversa ("mais curto", "destaque o kit"). */
  pedido: string | null;
  /** Instruções de base e exemplos de título da loja (0109). */
  estilo?: EstiloDaLoja | null;
}

export interface VarianteTitulo {
  titulo: string;
  /** Em uma frase, o que esta variante prioriza. */
  angulo: string;
}

export interface VarianteAvaliada extends VarianteTitulo {
  caracteres: number;
  nota: NotaTitulo;
  violacoes: Violacao[];
  /** Cabe no limite e não tem termo que bloqueia. */
  utilizavel: boolean;
}

export interface TitulosGerados {
  variantes: VarianteTitulo[];
  palavrasChave: string[];
}

const ANGULOS = [
  "1ª: começa pelo termo de busca mais forte",
  "2ª: o atributo ou benefício principal",
  "3ª: a variação, a quantidade ou o kit",
  "4ª: o que diferencia dos concorrentes (conteúdo, nunca preço)",
  "5ª: curta e direta, com o essencial",
];

export function montarPromptTitulos(ctx: ContextoTitulosEstudio): string {
  const dados = linhas([
    ["Produto", limparCampo(ctx.produto.nome, 200)],
    ["Variação", limparCampo(ctx.produto.variante, 60)],
    ["Categoria", limparCampo(ctx.produto.categoria, 60)],
    ["Itens que acompanham", ctx.produto.componentes.length ? limparCampo(ctx.produto.componentes.join(", "), 200) : null],
    ["Palavras-chave que o vendedor já usa", ctx.palavrasChave.length ? limparCampo(ctx.palavrasChave.join(", "), 200) : null],
    ["O que a loja vende", limparCampo(ctx.nicho, 120)],
    ["Pedido do vendedor", limparCampo(ctx.pedido, 300)],
  ]);

  const memoria = ctx.memoria
    .slice(0, 12)
    .map((m) => limparCampo(m, 160))
    .filter(Boolean)
    .map((m) => `- ${m}`)
    .join("\n");
  const proibidos = ctx.termosProibidos
    .slice(0, 30)
    .map((t) => limparCampo(t, 60))
    .filter(Boolean)
    .join(", ");
  const concorrentes = ctx.concorrentes
    .slice(0, 6)
    .map((c) => `- ${limparCampo(c.titulo, 120)}`)
    .join("\n");

  return `Você escreve títulos de anúncio para ${limparCampo(ctx.plataforma, 40) ?? "marketplace brasileiro"}.

${dados}
${blocoEstiloDaLoja(ctx.estilo, "titulo")}${memoria ? `\nO que a loja pediu para você lembrar (siga):\n${memoria}\n` : ""}${proibidos ? `\nNunca use estes termos: ${proibidos}.\n` : ""}${concorrentes ? `\nTítulos de concorrentes (referência de mercado: NÃO copie, só entenda o que eles destacam):\n${concorrentes}\n` : ""}
Gere ${VARIANTES_TITULO} títulos diferentes entre si, cada um com no máximo ${ctx.limite} caracteres (conte antes de responder). Cada um segue um ângulo:
${ANGULOS.map((a) => `- ${a}`).join("\n")}

Para cada título devolva "titulo" e "angulo" (uma frase curta do que ele prioriza). Devolva também até 10 "palavras_chave" de busca, da mais buscada para a menos.

Regras:
- Estrutura: tipo do produto + marca/modelo + atributo principal + variação/quantidade.
- Comece pelo termo que o comprador digitaria na busca. Aproveite o espaço, sem encher linguiça, sem repetir palavra.
- Português do Brasil. Sem emoji, hashtag, CAPS LOCK em palavra inteira, markdown nem HTML.
- Use SOMENTE as informações fornecidas. Não invente material, medida, marca, origem, garantia nem prazo.
- NÃO cite preço, desconto, frete grátis, promoção nem superlativo ("melhor", "mais vendido").`;
}

export function esquemaTitulos() {
  return {
    type: "object",
    properties: {
      variantes: {
        type: "array",
        items: { type: "object", properties: { titulo: { type: "string" }, angulo: { type: "string" } }, required: ["titulo", "angulo"] },
      },
      palavras_chave: { type: "array", items: { type: "string" } },
    },
    required: ["variantes", "palavras_chave"],
  };
}

/** Título é uma linha só: quebra vira espaço e o excesso é cortado sem partir palavra. */
function limparTitulo(t: string, limite: number): string {
  return truncarEmPalavra(t.replace(/\s+/g, " ").trim(), limite);
}

/** Lê a resposta e devolve algo seguro. Nunca lança; item ruim sai sozinho. */
export function interpretarTitulos(bruto: string, limite: number): TitulosGerados {
  const obj = lerObjetoJson(bruto) ?? {};
  const variantes: VarianteTitulo[] = [];
  const vistos = new Set<string>();
  for (const v of Array.isArray(obj.variantes) ? obj.variantes : []) {
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const titulo = typeof r.titulo === "string" ? limparTitulo(r.titulo, limite) : "";
    if (titulo.length < 3 || vistos.has(titulo.toLowerCase())) continue;
    vistos.add(titulo.toLowerCase());
    variantes.push({ titulo, angulo: typeof r.angulo === "string" ? truncarEmPalavra(r.angulo.replace(/\s+/g, " ").trim(), 80) : "" });
    if (variantes.length >= VARIANTES_TITULO) break;
  }
  const palavrasChave: string[] = [];
  const chaves = new Set<string>();
  for (const p of Array.isArray(obj.palavras_chave) ? obj.palavras_chave : []) {
    if (typeof p !== "string") continue;
    const termo = p.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!termo || chaves.has(termo.toLowerCase())) continue;
    chaves.add(termo.toLowerCase());
    palavrasChave.push(termo);
    if (palavrasChave.length >= 10) break;
  }
  return { variantes, palavrasChave };
}

export const titulosVazios = (t: TitulosGerados) => t.variantes.length === 0;

/**
 * Nota local e conferência de termos de cada variante. Ordena do melhor para o pior:
 * utilizáveis primeiro, depois pela nota.
 */
export function avaliarVariantes(
  variantes: readonly VarianteTitulo[],
  { limite, termoPrincipal, regras }: { limite: number; termoPrincipal: string | null; regras: readonly RegraTermo[] },
): VarianteAvaliada[] {
  const avaliadas = variantes.map((v): VarianteAvaliada => {
    const violacoes = verificarTextos([{ campo: "Título", texto: v.titulo, tipo: "texto" }], regras);
    const bloqueada = violacoes.some((x) => x.gravidade === "bloquear");
    return {
      ...v,
      caracteres: v.titulo.length,
      nota: avaliarTitulo(v.titulo, { limite, termoPrincipal }),
      violacoes,
      utilizavel: v.titulo.length <= limite && !bloqueada,
    };
  });
  return avaliadas.sort((a, b) => Number(b.utilizavel) - Number(a.utilizavel) || b.nota.nota - a.nota.nota);
}

/** Valores arredondados e listas ordenadas: poeira não invalida o cache. */
export function hashTitulos(ctx: ContextoTitulosEstudio): string {
  return hashTexto(
    [
      "titulos-estudio-v1",
      ctx.produto.nome,
      ctx.produto.variante ?? "",
      ctx.produto.categoria ?? "",
      ctx.produto.componentes.join("|"),
      ctx.plataforma,
      String(ctx.limite),
      ctx.nicho ?? "",
      ctx.palavrasChave.join("|"),
      ctx.memoria.join("|"),
      [...ctx.termosProibidos].sort().join("|"),
      ctx.concorrentes.map((c) => c.titulo).join("|"),
      ctx.pedido ?? "",
      // Só entra quando há direção da loja: sem ela, a chave (e o cache) fica igual à de antes.
      ...[hashEstilo(ctx.estilo, "titulo")].filter(Boolean),
    ].join("\u0001"),
  );
}
