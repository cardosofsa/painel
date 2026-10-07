/**
 * Listas paginadas no servidor (Produtos, Clientes, Estoque). PURO, coberto por `listas.test.ts`.
 *
 * As telas liam a tabela inteira e filtravam no navegador. Além do peso, o PostgREST do
 * Supabase devolve no máximo 1000 linhas por consulta (`max-rows`): a partir do 1001º
 * produto a lista, os totais e a busca ficavam incompletos sem aviso nenhum. Agora a
 * página pede só a fatia que mostra (`.range()` + `count: "exact"`) e a busca roda no
 * banco com `ilike`.
 */

export const TAMANHO_PAGINA = 50;
/** Palavras da busca que viram filtro; o resto é ignorado (cada uma é um `or` a mais). */
export const MAX_PALAVRAS = 5;

type Param = string | string[] | undefined;

function primeiro(v: Param): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `?pagina=` → inteiro ≥ 1. Lixo, zero e negativo viram 1. */
export function lerPagina(v: Param): number {
  const n = Number(primeiro(v));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 100_000) : 1;
}

/**
 * `?q=` → termo limpo: sem caractere de controle, sem `*` (o PostgREST trata `*` como
 * curinga no `ilike` e não há como escapar) e com espaços normalizados.
 */
export function lerTermo(v: Param): string {
  return (primeiro(v) ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}*]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    // De novo depois do corte: ler o próprio resultado tem que dar o mesmo termo.
    .trim();
}

/** Valor de uma lista fechada; qualquer outra coisa vira `""` (sem filtro). */
export function lerOpcao<T extends string>(v: Param, opcoes: readonly T[]): T | "" {
  const s = primeiro(v);
  return s && (opcoes as readonly string[]).includes(s) ? (s as T) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id vindo da URL: só passa se for um uuid (vai direto para um `.eq()`). */
export function lerId(v: Param): string {
  const s = primeiro(v) ?? "";
  return UUID.test(s) ? s.toLowerCase() : "";
}

/** Primeira e última linha da página, no formato do `.range(de, ate)` (inclusivo). */
export function faixaDaPagina(pagina: number, tamanho = TAMANHO_PAGINA): { de: number; ate: number } {
  const de = (Math.max(1, Math.floor(pagina)) - 1) * tamanho;
  return { de, ate: de + tamanho - 1 };
}

export function totalDePaginas(total: number, tamanho = TAMANHO_PAGINA): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / tamanho));
}

/** Escapa os curingas do LIKE do Postgres (`%`, `_` e a própria barra). */
export function escaparLike(t: string): string {
  return t.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Valor entre aspas para um filtro `or=(...)` do PostgREST. Sem as aspas, vírgula e
 * parênteses digitados quebrariam a sintaxe — ou montariam outro filtro. Dentro delas,
 * `"` e `\` vão com barra.
 */
export function valorPostgrest(v: string): string {
  return `"${v.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

export function palavrasDaBusca(termo: string): string[] {
  const vistas = new Set<string>();
  for (const p of lerTermo(termo).split(" ")) {
    if (p && !vistas.has(p.toLowerCase())) vistas.add(p.toLowerCase());
  }
  return [...vistas].slice(0, MAX_PALAVRAS);
}

/**
 * Um filtro `or` por palavra — o PostgREST junta vários `or=` com E. Assim "camiseta azul"
 * acha a camiseta cujo nome tem "camiseta" e a variante tem "azul", em vez de exigir a
 * frase inteira numa coluna só.
 *
 * `extras` acrescenta condições já prontas para a palavra (ex.: `grupo_id.in.(...)`).
 */
export function filtrosDeBusca(termo: string, colunas: readonly string[], extras?: (palavra: string) => string[]): string[] {
  return palavrasDaBusca(termo).map((palavra) => {
    const padrao = valorPostgrest(`*${escaparLike(palavra)}*`);
    return [...colunas.map((c) => `${c}.ilike.${padrao}`), ...(extras?.(palavra) ?? [])].join(",");
  });
}

/** Mesma regra do `ilike` com `*palavra*`, para filtrar em memória uma lista pequena. */
export function contemPalavra(texto: string | null | undefined, palavra: string): boolean {
  return (texto ?? "").toLocaleLowerCase("pt-BR").includes(palavra.toLocaleLowerCase("pt-BR"));
}

export type ParametrosLista = Record<string, string | number | null | undefined>;

/**
 * Monta a URL da lista a partir dos parâmetros atuais com as mudanças por cima. Vazio sai
 * da URL, e `pagina=1` também — a URL "limpa" é a primeira página sem filtro.
 */
export function hrefLista(caminho: string, atuais: ParametrosLista, mudancas: ParametrosLista = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...atuais, ...mudancas })) {
    if (v == null || v === "") continue;
    if (k === "pagina" && Number(v) <= 1) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${caminho}?${s}` : caminho;
}

// ---------------------------------------------------------------------------------------
// Situação de estoque (Produtos e Estoque)
// ---------------------------------------------------------------------------------------

export const SITUACOES_ESTOQUE = ["Em estoque", "Estoque baixo", "Sem estoque"] as const;
export type SituacaoEstoque = (typeof SITUACOES_ESTOQUE)[number];

interface LinhaEstoque {
  estoque: number;
  estoque_minimo: number;
}

/**
 * Uma situação por produto — a mesma regra conta os chips e filtra a lista, então o número
 * do chip é exatamente o que aparece ao clicar nele. Estoque negativo (venda sem estoque)
 * conta como baixo: precisa de reposição.
 */
export function situacaoEstoque(p: LinhaEstoque): SituacaoEstoque {
  const estoque = Number(p.estoque ?? 0);
  if (estoque === 0) return "Sem estoque";
  if (estoque <= Number(p.estoque_minimo ?? 0)) return "Estoque baixo";
  return "Em estoque";
}

/** "Repor" da tela de Estoque e "Reposição necessária" de Produtos: no mínimo ou abaixo. */
export function precisaRepor(p: LinhaEstoque): boolean {
  return Number(p.estoque ?? 0) <= Number(p.estoque_minimo ?? 0);
}

export interface ResumoEstoque {
  total: number;
  unidades: number;
  valorEmEstoque: number;
  reposicao: number;
  porSituacao: Record<SituacaoEstoque, number>;
}

/** Totais da tela inteira (não da página), a partir de uma consulta enxuta de todos os produtos. */
export function resumoDeEstoque(linhas: readonly (LinhaEstoque & { custo: number | null })[]): ResumoEstoque {
  const r: ResumoEstoque = {
    total: linhas.length,
    unidades: 0,
    valorEmEstoque: 0,
    reposicao: 0,
    porSituacao: { "Em estoque": 0, "Estoque baixo": 0, "Sem estoque": 0 },
  };
  for (const p of linhas) {
    const estoque = Number(p.estoque ?? 0);
    r.unidades += estoque;
    r.valorEmEstoque += Number(p.custo ?? 0) * estoque;
    if (precisaRepor(p)) r.reposicao++;
    r.porSituacao[situacaoEstoque(p)]++;
  }
  // Soma de float: arredonda no centavo para não aparecer R$ 0,30000000000000004.
  r.valorEmEstoque = Math.round(r.valorEmEstoque * 100) / 100;
  return r;
}

// ---------------------------------------------------------------------------------------
// Filtros de cada tela, lidos da URL (e revalidados na exportação, que recebe do cliente)
// ---------------------------------------------------------------------------------------

export type ParamsUrl = Record<string, Param>;

/** `?estoque=` de Produtos, em slug para a URL ficar legível. */
export const SITUACAO_POR_SLUG = { com: "Em estoque", baixo: "Estoque baixo", sem: "Sem estoque" } as const satisfies Record<string, SituacaoEstoque>;
export type SlugSituacao = keyof typeof SITUACAO_POR_SLUG;
export const SLUGS_SITUACAO = Object.keys(SITUACAO_POR_SLUG) as SlugSituacao[];

export type FiltroProdutos = {
  q: string;
  pagina: number;
  categoria: string;
  armazem: string;
  ativo: "" | "ativos" | "inativos";
  estoque: "" | SlugSituacao;
};

export function lerFiltroProdutos(sp: ParamsUrl): FiltroProdutos {
  return {
    // `?busca=` é o link da busca global (Ctrl+K).
    q: lerTermo(sp.q ?? sp.busca),
    pagina: lerPagina(sp.pagina),
    categoria: lerId(sp.categoria),
    armazem: lerId(sp.armazem),
    ativo: lerOpcao(sp.ativo, ["ativos", "inativos"] as const),
    estoque: lerOpcao(sp.estoque, SLUGS_SITUACAO),
  };
}

export type FiltroClientes = {
  q: string;
  pagina: number;
  /** "1" = só os possíveis duplicados (0043). */
  dup: "" | "1";
};

export function lerFiltroClientes(sp: ParamsUrl): FiltroClientes {
  return { q: lerTermo(sp.q ?? sp.busca), pagina: lerPagina(sp.pagina), dup: lerOpcao(sp.dup, ["1"] as const) };
}

export type FiltroEstoque = {
  q: string;
  pagina: number;
  armazem: string;
  situacao: "" | "repor" | "ok";
};

export function lerFiltroEstoque(sp: ParamsUrl): FiltroEstoque {
  return { q: lerTermo(sp.q), pagina: lerPagina(sp.pagina), armazem: lerId(sp.armazem), situacao: lerOpcao(sp.situacao, ["repor", "ok"] as const) };
}

/**
 * O termo da URL mudou: é a resposta de uma navegação que a própria caixa de busca pediu
 * (o campo fica como está — a pessoa pode ter continuado digitando) ou veio de fora (link
 * do menu, busca global), e aí o campo passa a mostrar o que a URL diz?
 *
 * `enviados` são os termos que a caixa mandou e ainda não voltaram, em ordem.
 */
export function conciliarTermo(termoUrl: string, enviados: readonly string[]): { externo: boolean; enviados: string[] } {
  const i = enviados.indexOf(termoUrl);
  return i >= 0 ? { externo: false, enviados: enviados.slice(i + 1) } : { externo: true, enviados: [] };
}
