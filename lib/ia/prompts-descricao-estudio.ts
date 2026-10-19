/**
 * Descrição do anúncio no estúdio. Puro, coberto por `prompts-descricao-estudio.test.ts`.
 *
 * Mesmo molde dos títulos (`prompts-titulos.ts`): a IA recebe o que a loja ensinou (memória,
 * termos que não quer) e o título já aprovado; os concorrentes entram só como referência do que
 * o mercado destaca. A conferência de termos é determinística. A IA só escreve o que foi
 * fornecido: nada de medida, material, garantia ou prazo inventado.
 */

import { LIMITE_DESCRICAO_SHOPEE } from "@/lib/anuncio-shopee";
import { verificarTextos, temBloqueio, type RegraTermo, type Violacao } from "@/lib/conformidade/termos";
import { blocoEstiloDaLoja, hashEstilo, type EstiloDaLoja } from "./estilo-loja";
import { hashTexto, lerObjetoJson, limparCampo, linhas } from "./texto";

/** Teto do estúdio: o limite da Shopee Brasil (3.000), uma constante só para o Painel inteiro. */
export const LIMITE_DESCRICAO_ESTUDIO = LIMITE_DESCRICAO_SHOPEE;
/** Abaixo disto o Seller Centre costuma recusar ou o anúncio fica pobre (mesma régua do checklist). */
export const MINIMO_DESCRICAO = 100;

export interface ContextoDescricaoEstudio {
  produto: { nome: string; variante: string | null; categoria: string | null; componentes: string[] };
  /** Título já aprovado no estúdio; o texto precisa ser coerente com ele. */
  titulo: string | null;
  plataforma: string;
  limite: number;
  nicho: string | null;
  palavrasChave: string[];
  memoria: string[];
  termosProibidos: string[];
  /** O que os concorrentes destacam (referência de mercado, não para copiar). */
  diferenciaisConcorrentes: string[];
  pedido: string | null;
  /** Instruções de base e exemplos de descrição da loja (0109). */
  estilo?: EstiloDaLoja | null;
}

export function montarPromptDescricaoEstudio(c: ContextoDescricaoEstudio): string {
  const dados = linhas([
    ["Produto", limparCampo(c.produto.nome, 200)],
    ["Variação", limparCampo(c.produto.variante, 60)],
    ["Categoria", limparCampo(c.produto.categoria, 60)],
    ["Itens que acompanham", c.produto.componentes.length ? limparCampo(c.produto.componentes.join(", "), 200) : null],
    ["Título do anúncio (já aprovado)", limparCampo(c.titulo, 200)],
    ["Palavras-chave para usar naturalmente", c.palavrasChave.length ? limparCampo(c.palavrasChave.join(", "), 200) : null],
    ["O que a loja vende", limparCampo(c.nicho, 120)],
    ["Pedido do vendedor", limparCampo(c.pedido, 300)],
  ]);
  const memoria = c.memoria
    .slice(0, 12)
    .map((m) => limparCampo(m, 160))
    .filter(Boolean)
    .map((m) => `- ${m}`)
    .join("\n");
  const proibidos = c.termosProibidos
    .slice(0, 30)
    .map((t) => limparCampo(t, 60))
    .filter(Boolean)
    .join(", ");
  const diferenciais = c.diferenciaisConcorrentes
    .slice(0, 10)
    .map((d) => limparCampo(d, 80))
    .filter(Boolean)
    .map((d) => `- ${d}`)
    .join("\n");

  return `Você escreve descrições de anúncio para ${limparCampo(c.plataforma, 40) ?? "marketplace brasileiro"}.

${dados}
${blocoEstiloDaLoja(c.estilo, "descricao")}${memoria ? `\nO que a loja pediu para você lembrar (siga):\n${memoria}\n` : ""}${proibidos ? `\nNunca use estes termos: ${proibidos}.\n` : ""}${diferenciais ? `\nO que anúncios concorrentes destacam (referência de mercado: NÃO copie frases, só entenda o que o comprador valoriza):\n${diferenciais}\n` : ""}
Escreva a descrição com no máximo ${c.limite} caracteres e pelo menos ${MINIMO_DESCRICAO}, em seções curtas separadas por linha em branco:
1. Abertura: 1 a 2 frases com o produto e o termo de busca mais forte.
2. Destaques: de 3 a 6 linhas começando com "• ", cada uma com um benefício de USO concreto.
3. O que acompanha (só se houver itens informados).
4. Como usar ou cuidados (só se der para dizer sem inventar).

Devolva em JSON: "descricao" (o texto) e "palavras_chave" (até 8 termos de busca).

Regras:
- Português do Brasil, simples e direto. Sem emoji, markdown nem HTML (o "• " das linhas é permitido).
- Use SOMENTE as informações fornecidas. Não invente material, medida, peso, marca, origem, garantia, prazo nem certificação.
- NÃO cite preço, desconto, frete grátis, promoção nem superlativo ("o melhor", "mais vendido").
- Sem telefone, WhatsApp, rede social, link nem pedido para falar fora da plataforma.
- Não prometa resultado nem efeito no corpo.`;
}

export function esquemaDescricaoEstudio() {
  return {
    type: "object",
    properties: { descricao: { type: "string" }, palavras_chave: { type: "array", items: { type: "string" } } },
    required: ["descricao", "palavras_chave"],
  };
}

export interface DescricaoGerada {
  descricao: string;
  palavrasChave: string[];
}

/** Descrição é texto em várias linhas: mantém as quebras, tira excesso e corta no limite sem partir palavra. */
function limparDescricao(t: string, limite: number): string {
  const limpo = t
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const quebra = Math.max(corte.lastIndexOf("\n"), corte.lastIndexOf(" "));
  return (quebra > limite * 0.6 ? corte.slice(0, quebra) : corte).trimEnd();
}

/** Lê a resposta e devolve algo seguro. Nunca lança. */
export function interpretarDescricaoEstudio(bruto: string, limite: number): DescricaoGerada {
  const obj = lerObjetoJson(bruto) ?? {};
  const descricao = typeof obj.descricao === "string" ? limparDescricao(obj.descricao, limite) : "";
  const palavrasChave: string[] = [];
  const vistas = new Set<string>();
  for (const p of Array.isArray(obj.palavras_chave) ? obj.palavras_chave : []) {
    if (typeof p !== "string") continue;
    const t = p.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    palavrasChave.push(t);
    if (palavrasChave.length >= 8) break;
  }
  return { descricao, palavrasChave };
}

export const descricaoVazia = (d: DescricaoGerada) => d.descricao.length < 20;

export interface AvaliacaoDescricao {
  caracteres: number;
  violacoes: Violacao[];
  curta: boolean;
  longa: boolean;
  /** Dentro dos limites e sem termo que bloqueia. */
  utilizavel: boolean;
}

export function avaliarDescricao(texto: string, { limite, regras }: { limite: number; regras: readonly RegraTermo[] }): AvaliacaoDescricao {
  const caracteres = texto.trim().length;
  const violacoes = verificarTextos([{ campo: "Descrição", texto, tipo: "texto" }], regras);
  const curta = caracteres < MINIMO_DESCRICAO;
  const longa = caracteres > limite;
  return { caracteres, violacoes, curta, longa, utilizavel: !curta && !longa && !temBloqueio(violacoes) };
}

export function hashDescricaoEstudio(c: ContextoDescricaoEstudio): string {
  return hashTexto(
    [
      "descricao-estudio-v1",
      c.produto.nome,
      c.produto.variante ?? "",
      c.produto.categoria ?? "",
      c.produto.componentes.join("|"),
      c.titulo ?? "",
      c.plataforma,
      String(c.limite),
      c.nicho ?? "",
      c.palavrasChave.join("|"),
      c.memoria.join("|"),
      [...c.termosProibidos].sort().join("|"),
      c.diferenciaisConcorrentes.join("|"),
      c.pedido ?? "",
      // Só entra quando há direção da loja: sem ela, a chave (e o cache) fica igual à de antes.
      ...[hashEstilo(c.estilo, "descricao")].filter(Boolean),
    ].join("\u0001"),
  );
}
