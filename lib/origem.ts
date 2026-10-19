/** Hosts em que a origem pode confiar: o domínio canônico, os da própria Vercel e os extras declarados. */
export function hostsPermitidos(env: Record<string, string | undefined> = process.env): Set<string> {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const host = (v: string | undefined) => {
    const t = v?.trim();
    if (!t) return;
    try {
      hosts.add(new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).host.toLowerCase());
    } catch {
      /* valor inválido: ignora */
    }
  };
  host(env.NEXT_PUBLIC_SITE_URL);
  // A Vercel preenche estes três sozinha (deploy, branch e produção).
  host(env.VERCEL_URL);
  host(env.VERCEL_BRANCH_URL);
  host(env.VERCEL_PROJECT_PRODUCTION_URL);
  for (const extra of (env.ORIGENS_PERMITIDAS ?? "").split(",")) host(extra);
  return hosts;
}

/**
 * Endereço público de quem fez a requisição (`https://dominio`, sem barra no fim).
 *
 * Atrás do proxy da Vercel o `origin` de `request.url` pode ser o host interno do deploy, e
 * a Shopee e o Mercado Livre recusam a autorização quando o domínio de volta não é o
 * cadastrado no app. O `x-forwarded-host` é o domínio que o navegador realmente pediu. Na
 * Vercel ele é preenchido pelo próprio proxy; fora dela (outro proxy, servidor próprio) só vale
 * se estiver na lista de hosts permitidos (`hostsPermitidos`): um cabeçalho forjado não pode
 * virar destino de redirecionamento nem de link. Fora da lista, vale o domínio
 * canônico (`NEXT_PUBLIC_SITE_URL`), e sem ele a origem da própria requisição.
 */
export function origemDaRequisicao(headers: Headers, fallback: string, env: Record<string, string | undefined> = process.env): string {
  const base = fallback.replace(/\/$/, "");
  const canonico = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const padrao = canonico && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(canonico) ? canonico : base;
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host)) return padrao;
  const permitidos = hostsPermitidos(env);
  let hostBase = "";
  try {
    hostBase = new URL(base).host.toLowerCase();
  } catch {
    /* fallback inválido */
  }
  // Na Vercel quem preenche o x-forwarded-host é o proxy dela, com o domínio que de fato recebeu a
  // requisição (ela só roteia domínios do próprio projeto): vale. Fora dela, só na lista.
  if (env.VERCEL !== "1" && !permitidos.has(host) && host !== hostBase) return padrao;
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
