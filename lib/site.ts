/**
 * Endereço público do sistema (sem barra no fim), para sitemap, robots e metadados.
 * `NEXT_PUBLIC_SITE_URL` manda; na Vercel, cai no domínio de produção que ela informa.
 */
export function urlDoSite(): string | null {
  const bruto = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return bruto ? bruto.replace(/\/$/, "") : null;
}
