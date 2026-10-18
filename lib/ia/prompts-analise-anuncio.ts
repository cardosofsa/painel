/**
 * Prompt, esquema e leitura da resposta da ANÁLISE DO ANÚNCIO (texto) e da análise da CAPA.
 *
 * A IA não calcula nada: título, nota, vendas, preço e veredito chegam prontos de
 * `lib/analise-anuncio.ts` e do Ajuste de Preço. Ela narra, sugere 3 títulos e prioriza a
 * estratégia. Nenhum dado de cliente final vai ao prompt. Título sugerido que passa do limite
 * ou tem termo barrado é descartado na leitura.
 */
import { regrasAtivas, verificarTextos } from "@/lib/conformidade/termos";
import { hashTexto, lerObjetoJson, linhas, truncarEmPalavra } from "./texto";

export interface ContextoAnaliseIA {
  titulo: string;
  plataforma: string;
  limite: number;
  nota: number;
  criteriosFalhos: string[];
  palavrasAusentes: string[];
  imagens: { total: number | null; recomendado: number };
  vendas: { unidades30: number; pedidos30: number; unidades90: number; tendencia: string; veredito: string } | null;
  preco: { atual: number | null; ideal: number | null; minimo: number | null; lucro: number | null; margemPct: number | null; zonaMorta: boolean } | null;
  estoqueDias: number | null;
}

export type AbaAnalise = "titulo" | "imagens" | "preco" | "estrategia";

export interface PassoEstrategia {
  aba: AbaAnalise;
  acao: string;
  motivo: string;
}

export interface NarracaoAnalise {
  diagnostico: string;
  titulos: string[];
  estrategia: PassoEstrategia[];
}

const brl = (n: number | null) => (n === null ? "sem dado" : `R$ ${n.toFixed(2).replace(".", ",")}`);

export function montarPromptAnalise(ctx: ContextoAnaliseIA): string {
  const dados = linhas([
    ["Título atual", `"${ctx.titulo}" (${ctx.titulo.length}/${ctx.limite} caracteres)`],
    ["Nota do título (regras locais)", `${ctx.nota}/100${ctx.criteriosFalhos.length ? `; falhas: ${ctx.criteriosFalhos.join("; ")}` : ""}`],
    ["Palavras-chave do produto fora do título", ctx.palavrasAusentes.length ? ctx.palavrasAusentes.join(", ") : null],
    ["Imagens", ctx.imagens.total === null ? "quantidade não lida" : `${ctx.imagens.total} (recomendado ${ctx.imagens.recomendado})`],
    ["Vendas", ctx.vendas ? `${ctx.vendas.unidades30} un. em 30 dias (${ctx.vendas.pedidos30} pedidos), ${ctx.vendas.unidades90} em 90; ${ctx.vendas.tendencia}; classificação: ${ctx.vendas.veredito}` : "sem dado"],
    [
      "Preço",
      ctx.preco
        ? `atual ${brl(ctx.preco.atual)}, ideal ${brl(ctx.preco.ideal)}, mínimo ${brl(ctx.preco.minimo)}, lucro por venda ${brl(ctx.preco.lucro)}${ctx.preco.margemPct !== null ? `, margem ${ctx.preco.margemPct.toFixed(1).replace(".", ",")}%` : ""}${ctx.preco.zonaMorta ? ", NA ZONA MORTA da comissão" : ""}`
        : "sem dado",
    ],
    ["Estoque", ctx.estoqueDias !== null ? `cerca de ${ctx.estoqueDias} dias de venda` : null],
  ]);
  return `Você é a Vixe, consultora de um pequeno vendedor brasileiro de ${ctx.plataforma}. Fale direto, em português simples.

Números do anúncio (já calculados pelo sistema; estão certos):
${dados}

Responda em JSON com:
- diagnostico: 2 a 4 frases sobre o anúncio, citando os números mais importantes (até 500 caracteres).
- titulos: exatamente 3 sugestões de título, cada uma com até ${ctx.limite} caracteres, termo de busca principal no começo, sem repetir palavra, sem emoji, sem preço, sem promoção, sem contato.
- estrategia: de 2 a 5 passos em ordem de prioridade, cada um com aba ("titulo", "imagens", "preco" ou "estrategia"), acao (até 120 caracteres) e motivo (até 200, citando o número que justifica).

Regras:
- Use SOMENTE os números acima. Não invente volume de busca, visita, conversão, concorrente nem preço novo em reais.
- Preço: diga o que testar (ex.: "sair da zona morta", "subir até o ideal") sem dar valor próprio.
- Sem alegação de saúde, sem superlativo sem prova, sem markdown, sem HTML.`;
}

export function esquemaAnalise() {
  return {
    type: "object",
    properties: {
      diagnostico: { type: "string" },
      titulos: { type: "array", items: { type: "string" } },
      estrategia: {
        type: "array",
        items: { type: "object", properties: { aba: { type: "string" }, acao: { type: "string" }, motivo: { type: "string" } }, required: ["aba", "acao", "motivo"] },
      },
    },
    required: ["diagnostico", "titulos", "estrategia"],
  };
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? truncarEmPalavra(v.replace(/\s+/g, " ").trim(), max) : "");
const ABAS: AbaAnalise[] = ["titulo", "imagens", "preco", "estrategia"];

/** Nunca lança. Título longo demais ou com termo barrado (da base ou do usuário) é descartado. */
export function interpretarAnalise(bruto: string, limite: number, termosProibidos: readonly string[]): NarracaoAnalise {
  const obj = lerObjetoJson(bruto) ?? {};
  const regras = regrasAtivas([], termosProibidos);
  const titulos: string[] = [];
  for (const t of Array.isArray(obj.titulos) ? obj.titulos : []) {
    const s = typeof t === "string" ? t.replace(/\s+/g, " ").trim() : "";
    if (s.length < 10 || s.length > limite) continue;
    if (verificarTextos([{ campo: "Título", texto: s, tipo: "texto" }], regras).length) continue;
    if (!titulos.some((x) => x.toLowerCase() === s.toLowerCase())) titulos.push(s);
    if (titulos.length >= 3) break;
  }
  const estrategia: PassoEstrategia[] = [];
  for (const x of Array.isArray(obj.estrategia) ? obj.estrategia : []) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const acao = texto(r.acao, 120);
    if (!acao) continue;
    const aba = ABAS.includes(r.aba as AbaAnalise) ? (r.aba as AbaAnalise) : "estrategia";
    estrategia.push({ aba, acao, motivo: texto(r.motivo, 200) });
    if (estrategia.length >= 5) break;
  }
  return { diagnostico: texto(obj.diagnostico, 500), titulos, estrategia };
}

export const analiseVazia = (n: NarracaoAnalise) => !n.diagnostico && n.titulos.length === 0 && n.estrategia.length === 0;

/** Valores arredondados: poeira não invalida o cache. */
export function hashContextoAnalise(ctx: ContextoAnaliseIA): string {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : Math.round(v).toString());
  return hashTexto(
    [
      "analise-v1",
      ctx.titulo,
      ctx.plataforma,
      String(ctx.limite),
      String(ctx.nota),
      ctx.palavrasAusentes.join(","),
      n(ctx.imagens.total),
      ctx.vendas ? [ctx.vendas.unidades30, ctx.vendas.pedidos30, ctx.vendas.unidades90, ctx.vendas.tendencia, ctx.vendas.veredito].join(":") : "",
      ctx.preco ? [n(ctx.preco.atual), n(ctx.preco.ideal), n(ctx.preco.minimo), n(ctx.preco.lucro), ctx.preco.zonaMorta ? "1" : "0"].join(":") : "",
      n(ctx.estoqueDias),
    ].join("\u0001"),
  );
}

// ---------- Capa ----------

export interface ContextoCapaIA {
  titulo: string;
  plataforma: string;
  capaFundoBranco: boolean;
  /** Resumo da Ficha de arte da capa (perfil da loja), quando houver. */
  ficha: string | null;
}

export type AspectoCapa = "legibilidade" | "contraste" | "produto" | "texto" | "ficha";

export interface PontoCapa {
  aspecto: AspectoCapa;
  ok: boolean;
  comentario: string;
}

export interface AnaliseCapa {
  resumo: string;
  pontos: PontoCapa[];
}

export function montarPromptCapa(ctx: ContextoCapaIA): string {
  return `Você avalia a CAPA (primeira imagem) de um anúncio de ${ctx.plataforma}. Título do anúncio: "${ctx.titulo}".
${ctx.capaFundoBranco ? "A plataforma costuma exigir fundo branco na primeira imagem.\n" : ""}${ctx.ficha ? `Padrão visual da loja (Ficha de arte):\n${ctx.ficha}\n` : ""}
Olhe a imagem como ela aparece reduzida na busca (cerca de 110 px) e responda em JSON com:
- resumo: 1 a 2 frases (até 240 caracteres).
- pontos: um item para cada aspecto — "legibilidade" (dá para ler o que está escrito, se houver), "contraste" (produto se destaca do fundo), "produto" (o produto ocupa a imagem e é reconhecível), "texto" (texto demais, cobre o produto ou tem promoção/preço), ${ctx.ficha ? '"ficha" (segue o padrão visual da loja)' : '"ficha" (ok: true e comentario "Sem ficha cadastrada")'}. Cada um com ok (true/false) e comentario (até 160 caracteres, dizendo o que mudar quando não está ok).

Regras: descreva só o que está na imagem; sem markdown; português do Brasil.`;
}

export function esquemaCapa() {
  return {
    type: "object",
    properties: {
      resumo: { type: "string" },
      pontos: { type: "array", items: { type: "object", properties: { aspecto: { type: "string" }, ok: { type: "boolean" }, comentario: { type: "string" } }, required: ["aspecto", "ok", "comentario"] } },
    },
    required: ["resumo", "pontos"],
  };
}

const ASPECTOS: AspectoCapa[] = ["legibilidade", "contraste", "produto", "texto", "ficha"];

export function interpretarCapa(bruto: string): AnaliseCapa {
  const obj = lerObjetoJson(bruto) ?? {};
  const vistos = new Set<string>();
  const pontos: PontoCapa[] = [];
  for (const x of Array.isArray(obj.pontos) ? obj.pontos : []) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (!ASPECTOS.includes(r.aspecto as AspectoCapa) || vistos.has(r.aspecto as string)) continue;
    vistos.add(r.aspecto as string);
    pontos.push({ aspecto: r.aspecto as AspectoCapa, ok: r.ok === true, comentario: texto(r.comentario, 160) });
  }
  pontos.sort((a, b) => ASPECTOS.indexOf(a.aspecto) - ASPECTOS.indexOf(b.aspecto));
  return { resumo: texto(obj.resumo, 240), pontos };
}

export const hashCapa = (hashImagem: string, ctx: ContextoCapaIA) => hashTexto(["capa-v1", hashImagem, ctx.titulo, ctx.plataforma, ctx.ficha ?? ""].join("\u0001"));
