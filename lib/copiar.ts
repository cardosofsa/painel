/**
 * Copiar para a área de transferência. A parte PURA (o que vai ser copiado) é coberta por
 * `copiar.test.ts`; a cópia em si roda só no navegador.
 *
 * Por que existe: o projeto tinha ~13 `navigator.clipboard.writeText` soltos, cada um com o seu
 * aviso e sem plano B. A API moderna falha em contexto não seguro (http), em iframe sem
 * permissão e em alguns navegadores de celular; o plano B (`execCommand` num textarea
 * temporário) cobre esses casos.
 */

import { formatBRL } from "@/lib/format";

// ---------- O que copiar (puro) ----------

/** Lista de palavras-chave numa linha só, sem repetir e sem vazios: do jeito que se cola num campo. */
export function textoPalavrasChave(palavras: readonly string[]): string {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const p of palavras) {
    const t = p.replace(/\s+/g, " ").trim();
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    saida.push(t);
  }
  return saida.join(", ");
}

/** Hashtags a partir das palavras-chave ("bolsa de couro" → "#bolsadecouro"), sem repetir. */
export function textoHashtags(palavras: readonly string[], max = 18): string {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const p of palavras) {
    const t = p
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!t || vistas.has(t)) continue;
    vistas.add(t);
    saida.push(`#${t}`);
    if (saida.length >= max) break;
  }
  return saida.join(" ");
}

/** Preço no formato que a Shopee pede no campo: número com vírgula, sem "R$". */
export function textoPreco(valor: number | null | undefined): string {
  return valor != null && Number.isFinite(valor) && valor > 0 ? valor.toFixed(2).replace(".", ",") : "";
}

export interface ConcorrenteCopia {
  titulo: string;
  precoTexto: string | null;
  diferenciais: string[];
  url: string;
}

/** Concorrente como referência: título, o que destaca e o link. */
export function textoConcorrente(c: ConcorrenteCopia): string {
  return [c.titulo, c.precoTexto ? `Preço visto: ${c.precoTexto}` : "", c.diferenciais.length ? `Destaca: ${c.diferenciais.join(" · ")}` : "", c.url].filter(Boolean).join("\n");
}

export interface PacoteAnuncio {
  titulo: string | null;
  descricao: string | null;
  palavrasChave: readonly string[];
  preco: number | null;
  numeroImagens: number | null;
}

/** O pacote inteiro, na ordem em que o Seller Centre pede. Campo vazio não vira linha. */
export function textoPacoteAnuncio(p: PacoteAnuncio): string {
  const partes: string[] = [];
  if (p.titulo?.trim()) partes.push(`TÍTULO\n${p.titulo.trim()}`);
  if (p.descricao?.trim()) partes.push(`DESCRIÇÃO\n${p.descricao.trim()}`);
  const palavras = textoPalavrasChave(p.palavrasChave);
  if (palavras) partes.push(`PALAVRAS-CHAVE\n${palavras}`);
  const tags = textoHashtags(p.palavrasChave);
  if (tags) partes.push(`HASHTAGS\n${tags}`);
  if (p.preco && p.preco > 0) partes.push(`PREÇO\n${formatBRL(p.preco)}`);
  if (p.numeroImagens) partes.push(`IMAGENS\n${p.numeroImagens}`);
  return partes.join("\n\n");
}

// ---------- Copiar (navegador) ----------

/** Plano B: textarea temporário + `execCommand("copy")`. Funciona onde `navigator.clipboard` não. */
function copiarComTextarea(texto: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  const ativo = document.activeElement as HTMLElement | null;
  area.select();
  area.setSelectionRange(0, texto.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  ativo?.focus?.();
  return ok;
}

/** Copia o texto. Devolve `true` se conseguiu por qualquer um dos dois caminhos. */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (!texto) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no plano B
  }
  return copiarComTextarea(texto);
}

/** Copia uma imagem (PNG) quando o navegador deixa. `false` = não suportado ou bloqueado. */
export async function copiarImagem(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    return true;
  } catch {
    return false;
  }
}
