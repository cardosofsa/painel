/**
 * Perfil de acesso guardado num cookie ASSINADO (HMAC-SHA256), para o middleware não ir ao
 * banco (`perfis_acesso`) a cada navegação. Vale poucos minutos: suspender, liberar ou
 * mudar as abas de alguém chega à pessoa no máximo nesse tempo.
 *
 * O cookie não é segredo (dá para ler), mas não dá para forjar nem trocar de conta: a
 * assinatura cobre todo o conteúdo e o middleware confere se o id é o do JWT validado.
 *
 * Web Crypto (`crypto.subtle`): funciona no proxy do Next, no Node e nos testes.
 */

export const COOKIE_ACESSO = "sertao_acesso";
/** Validade do cookie. */
export const VALIDADE_ACESSO_MS = 2 * 60 * 1000;

export interface AcessoCacheado {
  /** user_id (sub do JWT). */
  u: string;
  /** papel. */
  p: "master" | "usuario";
  /** status. */
  s: string;
  /** expira_em (data ISO) ou null. */
  e: string | null;
  /** abas liberadas. */
  a: string[];
  /** quando este cookie deixa de valer (ms). */
  x: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function chave(segredo: string): Promise<CryptoKey> {
  // Deriva uma chave só para isto: o mesmo segredo de ambiente pode servir a outros usos.
  const base = await crypto.subtle.digest("SHA-256", enc.encode(`sertao-acesso-v1:${segredo}`));
  return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function assinarAcesso(dados: Omit<AcessoCacheado, "x">, segredo: string, agora = Date.now()): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify({ ...dados, x: agora + VALIDADE_ACESSO_MS })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chave(segredo), enc.encode(corpo)));
  return `${corpo}.${b64url(sig)}`;
}

/** null = ausente, adulterado, de outra conta ou vencido. */
export async function lerAcesso(valor: string | undefined, segredo: string, userId: string, agora = Date.now()): Promise<AcessoCacheado | null> {
  if (!valor) return null;
  const [corpo, sig] = valor.split(".");
  if (!corpo || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await chave(segredo), deB64url(sig) as BufferSource, enc.encode(corpo));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as AcessoCacheado;
    if (d.u !== userId || typeof d.x !== "number" || d.x < agora || !Array.isArray(d.a)) return null;
    return d;
  } catch {
    return null;
  }
}

/** Segredo do cookie: `ACESSO_SEGREDO`, ou a chave do cofre que já existe. Sem nenhum, sem cache. */
export function segredoAcesso(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.ACESSO_SEGREDO?.trim() || env.IA_CHAVE_COFRE?.trim();
  return s && s.length >= 16 ? s : null;
}

/** Cabeçalho interno que o middleware passa às páginas (sempre reescrito por ele). */
export const CABECALHO_ACESSO = "x-sertao-acesso";

export interface AcessoRequisicao {
  userId: string;
  email: string | null;
  papel: "master" | "usuario";
  abas: string[];
}
