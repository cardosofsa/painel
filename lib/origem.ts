/**
 * Endereço público de quem fez a requisição (`https://dominio`, sem barra no fim).
 *
 * Atrás do proxy da Vercel o `origin` de `request.url` pode ser o host interno do deploy, e
 * a Shopee e o Mercado Livre recusam a autorização quando o domínio de volta não é o
 * cadastrado no app. O `x-forwarded-host` é o domínio que o navegador realmente pediu.
 */
export function origemDaRequisicao(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return fallback.replace(/\/$/, "");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Domínio principal (`NEXT_PUBLIC_SITE_URL`), quando definido e diferente do atual. A volta
 * da autorização dos marketplaces precisa sair dele: é o único cadastrado no app da
 * plataforma, e os cookies do `estado` precisam estar no mesmo domínio da volta.
 */
export function dominioPrincipalSeDiferente(origemAtual: string, site = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  const principal = site?.trim().replace(/\/$/, "");
  if (!principal || !/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(principal)) return null;
  return principal.toLowerCase() === origemAtual.toLowerCase() ? null : principal;
}
