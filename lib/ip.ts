/**
 * Origem de uma requisição para os freios do banco (0077: cota do frete da vitrine e erros do
 * app), sem guardar o IP: só um HMAC-SHA256 dele com um segredo do servidor. Código de
 * SERVIDOR (o segredo não pode ir para o navegador). Web Crypto: roda no Node e no Edge.
 */

type Cabecalhos = { get(nome: string): string | null };

/** Primeiro endereço do `x-forwarded-for` (na Vercel, o cliente), senão `x-real-ip`. Vazio sem nenhum. */
export function ipDoCabecalho(xff: string | null | undefined, realIp?: string | null): string {
  const primeiro = (xff ?? "").split(",")[0]?.trim() ?? "";
  return (primeiro || realIp?.trim() || "").slice(0, 64);
}

/** Segredo do hash: `ACESSO_SEGREDO`, senão a chave do cofre, senão a service key. Nenhum → null. */
export function segredoIp(env: Record<string, string | undefined> = process.env): string | null {
  return env.ACESSO_SEGREDO?.trim() || env.IA_CHAVE_COFRE?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** HMAC-SHA256(ip) em hex (64 caracteres). O mesmo IP com o mesmo segredo dá sempre o mesmo hash. */
export async function hashIp(ip: string, segredo: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey("raw", enc.encode(`ip:${segredo}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(ip));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash da origem da requisição; null sem IP nos cabeçalhos ou sem segredo configurado. */
export async function hashIpDaRequisicao(h: Cabecalhos, segredo: string | null = segredoIp()): Promise<string | null> {
  // Na Vercel, x-vercel-forwarded-for e x-real-ip são preenchidos pela própria plataforma; o
  // primeiro item do x-forwarded-for pode vir do cliente atrás de outro proxy. Só cai nele por último.
  const confiavel = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  const ip = confiavel ? confiavel.slice(0, 64) : ipDoCabecalho(h.get("x-forwarded-for"));
  if (!ip || !segredo) return null;
  return hashIp(ip, segredo);
}
