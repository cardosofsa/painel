/**
 * Pesquisa de concorrentes na web. Parte PURA (prompt, leitura da resposta, confiança, cache),
 * coberta por `prompts-concorrentes.test.ts`. A chamada de rede mora em `pesquisa.ts`.
 *
 * Regra de ouro: concorrente sem link não entra, e preço só aparece se o modelo o achou numa
 * fonte. O link citado é marcado como "confirmado" quando o endereço bate com uma das fontes
 * que a busca realmente consultou; senão aparece como "citado" para o usuário conferir. A
 * resposta do modelo é só uma LISTA PARA CONFERIR: nunca é copiada para o anúncio.
 */

import { hashTexto, lerObjetoJson, limparCampo, truncarEmPalavra } from "./texto";

export interface ContextoConcorrentes {
  produtoNome: string;
  plataforma: string;
  /** Texto livre do usuário sobre o que a loja vende; opcional. */
  nicho: string | null;
}

export interface Fonte {
  url: string;
  titulo: string;
}

export interface Concorrente {
  titulo: string;
  /** Como o preço apareceu na fonte ("R$ 89,90 a R$ 120"); `null` se não apareceu. */
  precoTexto: string | null;
  diferenciais: string[];
  url: string;
  /** O endereço bate com uma fonte realmente consultada pela busca. */
  confirmado: boolean;
}

export interface PesquisaConcorrentes {
  concorrentes: Concorrente[];
  /** Fontes consultadas pela busca (para o usuário abrir e conferir). */
  fontes: Fonte[];
  observacao: string;
}

export function montarPromptConcorrentes(c: ContextoConcorrentes): string {
  return `Pesquise na web anúncios à venda no Brasil de: ${limparCampo(c.produtoNome, 160) ?? "o produto"}.
${c.nicho ? `Contexto: a loja vende ${limparCampo(c.nicho, 120)}.\n` : ""}Priorize anúncios em ${limparCampo(c.plataforma, 40) ?? "marketplaces"} e, se não achar, de outros marketplaces e lojas brasileiras.

Liste até 6 anúncios concorrentes REAIS que você encontrou. Para cada um: "titulo" (como aparece no anúncio), "preco_texto" (só se o preço aparece na fonte, do jeito que aparece; senão deixe vazio), "diferenciais" (até 4 destaques do anúncio: material, quantidade, brinde, garantia...) e "url" (o endereço da página do anúncio).

Responda SOMENTE com um objeto JSON neste formato, sem texto fora dele:
{"concorrentes":[{"titulo":"","preco_texto":"","diferenciais":[""],"url":""}],"observacao":""}

Regras:
- Inclua só o que você encontrou nas páginas pesquisadas. Se não encontrou nada confiável, devolva "concorrentes": [] e explique em "observacao" (até 200 caracteres).
- Não invente título, preço, diferencial nem endereço.
- Não copie descrição inteira; resuma os destaques com suas palavras.`;
}

/** Pura. Tira o texto e as fontes da resposta crua da API com busca (`candidates[0]`). */
export function extrairResposta(json: unknown): { texto: string; fontes: Fonte[] } {
  const raiz = (json ?? {}) as Record<string, unknown>;
  const cand = ((raiz.candidates as Record<string, unknown>[] | undefined) ?? [])[0] ?? {};
  const partes = ((cand.content as Record<string, unknown> | undefined)?.parts as Record<string, unknown>[] | undefined) ?? [];
  const texto = partes.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  const meta = (cand.groundingMetadata ?? {}) as Record<string, unknown>;
  const fontes: Fonte[] = [];
  const vistos = new Set<string>();
  for (const ch of (meta.groundingChunks as Record<string, unknown>[] | undefined) ?? []) {
    const web = (ch.web ?? {}) as { uri?: unknown; title?: unknown };
    const url = typeof web.uri === "string" ? web.uri : "";
    if (!/^https?:\/\//i.test(url) || vistos.has(url)) continue;
    vistos.add(url);
    fontes.push({ url, titulo: typeof web.title === "string" ? web.title.slice(0, 120) : "" });
    if (fontes.length >= 12) break;
  }
  return { texto, fontes };
}

/** O que vai para o cache: texto do modelo + fontes, num JSON só (o cache guarda um texto). */
export const empacotarPesquisa = (texto: string, fontes: Fonte[]) => JSON.stringify({ texto, fontes });

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** O endereço citado é de um site que a busca de fato consultou? (o link da fonte costuma ser um redirecionador, então compara também o título, que traz o domínio) */
export function bateComFontes(url: string, fontes: readonly Fonte[]): boolean {
  const host = hostDe(url);
  if (!host) return false;
  return fontes.some((f) => f.url === url || f.titulo.toLowerCase().includes(host) || (hostDe(f.url) ?? "") === host);
}

/** Lê o pacote guardado e devolve algo seguro. Nunca lança; item sem link válido sai. */
export function interpretarConcorrentes(bruto: string): PesquisaConcorrentes {
  const pacote = lerObjetoJson(bruto) ?? {};
  const fontes: Fonte[] = [];
  for (const f of Array.isArray(pacote.fontes) ? pacote.fontes : []) {
    const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    if (typeof r.url === "string" && /^https?:\/\//i.test(r.url)) fontes.push({ url: r.url, titulo: typeof r.titulo === "string" ? r.titulo.slice(0, 120) : "" });
  }
  const dados = lerObjetoJson(typeof pacote.texto === "string" ? pacote.texto : "") ?? {};
  const concorrentes: Concorrente[] = [];
  const vistos = new Set<string>();
  for (const c of Array.isArray(dados.concorrentes) ? dados.concorrentes : []) {
    const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const titulo = typeof r.titulo === "string" ? truncarEmPalavra(r.titulo.replace(/\s+/g, " ").trim(), 140) : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (titulo.length < 3 || !/^https?:\/\//i.test(url) || url.length > 500 || vistos.has(url)) continue;
    vistos.add(url);
    const preco = typeof r.preco_texto === "string" ? r.preco_texto.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    concorrentes.push({
      titulo,
      // Preço só vale se tem algum dígito; "variável", "consulte" etc. não são preço.
      precoTexto: /\d/.test(preco) ? preco : null,
      diferenciais: (Array.isArray(r.diferenciais) ? r.diferenciais : [])
        .filter((d): d is string => typeof d === "string")
        .map((d) => truncarEmPalavra(d.replace(/\s+/g, " ").trim(), 80))
        .filter(Boolean)
        .slice(0, 4),
      url,
      confirmado: bateComFontes(url, fontes),
    });
    if (concorrentes.length >= 6) break;
  }
  const observacao = typeof dados.observacao === "string" ? truncarEmPalavra(dados.observacao.replace(/\s+/g, " ").trim(), 200) : "";
  return { concorrentes, fontes, observacao };
}

/** Sem concorrente aproveitável e sem explicação: a busca não rendeu nada utilizável. */
export const pesquisaVazia = (p: PesquisaConcorrentes) => p.concorrentes.length === 0 && !p.observacao;

export function hashConcorrentes(c: ContextoConcorrentes): string {
  return hashTexto(["concorrentes-v1", c.produtoNome.toLowerCase().trim(), c.plataforma, c.nicho ?? ""].join("\u0001"));
}
