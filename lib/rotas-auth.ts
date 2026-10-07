/**
 * Decisões de rota do middleware que dependem só do caminho (e de dois fatos da sessão).
 *
 * Moram aqui, e não dentro de `lib/supabase/middleware.ts`, para serem testadas sem montar
 * requisição nem cliente do Supabase (`rotas-auth.test.ts`). Erro aqui é rota do painel
 * abrindo sem sessão, ou tela de login/recuperação que ninguém alcança — o tipo de bug que
 * só aparece com a conta de outra pessoa.
 */

/**
 * Casa o caminho exato ou um filho dele (`/vitrine` e `/vitrine/abc`, nunca
 * `/vitrine-admin`). Era `startsWith` cru, que liberaria sem sessão qualquer rota nova
 * cujo nome apenas começasse igual — hoje não existe nenhuma, e o objetivo é que continue
 * não existindo por construção, não por sorte.
 */
export function ehOuComeca(pathname: string, bases: readonly string[]): boolean {
  return bases.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Rotas que abrem sem sessão. `/` também (ver `rotaPublica`): o Google exige que a página
 * inicial explique a finalidade do app, e quem já tem sessão é mandado para /dashboard pela
 * própria página.
 *
 * `/recuperar` e `/auth/reset` estão aqui por um motivo que só aparece com conta de outra
 * pessoa: sem isso, o bloco de controle de acesso do middleware consulta `perfis_acesso` e
 * manda quem está `pendente`, `suspenso` ou vencido para `/aguardando` — ou seja, a conta
 * suspensa NUNCA conseguiria trocar a senha, que é justamente o caso em que trocar mais
 * importa. Testar só com a conta master esconde isso.
 */
export const ROTAS_PUBLICAS = [
  "/login",
  "/signup",
  "/recuperar",
  "/auth/callback",
  "/auth/reset",
  "/vitrine",
  // Exigidas pelo Google (e pela LGPD) para publicar o login: precisam abrir sem sessão.
  "/privacidade",
  "/termos",
  // Calculadora de preço aberta ao público (sem conta).
  "/calculadora",
  // Quem faz o pedido é o cliente final, que nunca teve login. Sem esta linha o POST
  // viraria um redirect para /login e o carrinho nunca enviaria.
  "/api/vitrine",
  // O navegador reporta violação de CSP sem sessão. Sem esta linha o relatório viraria
  // um redirect para /login e a violação nunca chegaria ao log.
  "/api/csp-report",
  // Verificação de saúde (monitoramento externo, sem sessão).
  "/api/saude",
  // Instalar o app no celular: o navegador busca o manifesto sem sessão.
  "/manifest.webmanifest",
  // Service worker do PDV sem internet (11.4): o navegador busca sem sessão.
  "/sw.js",
  // Cron da Vercel (sem sessão): a rota exige o CRON_SECRET no cabeçalho.
  "/api/cron",
  // Notificações do Mercado Livre (sem sessão): a rota relê o pedido na API, não confia no corpo.
  "/api/mercadolivre/notificacoes",
  // Webhook do provedor de cobrança (10.9): valida a assinatura do evento; sem provedor, 404.
  "/api/cobranca/webhook",
  // Buscadores e prévias de link (WhatsApp, redes) leem estes sem sessão.
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
] as const;

export function rotaPublica(pathname: string): boolean {
  return pathname === "/" || ehOuComeca(pathname, ROTAS_PUBLICAS);
}

/**
 * Só login e cadastro. `/auth/reset` NÃO pode entrar aqui: nesse ponto o usuário já tem
 * sessão — criada pelo próprio link de recuperação —, então a regra
 * `usuário logado em rota de entrada → /dashboard` expulsaria exatamente quem precisa da
 * tela, tornando a redefinição de senha inalcançável por construção. `/auth/mfa` também não:
 * quem está nela tem sessão (aal1) e precisa ficar.
 */
export const ROTAS_DE_ENTRADA = ["/login", "/signup"] as const;

export function rotaDeEntrada(pathname: string): boolean {
  return ehOuComeca(pathname, ROTAS_DE_ENTRADA);
}

/**
 * Tela do código do app autenticador. Exige sessão (não está em `ROTAS_PUBLICAS`), mas não
 * exige o segundo fator — é onde ele é dado — nem passa pelo controle de acesso por conta:
 * se passasse, conta pendente com MFA iria daqui para `/aguardando`, que exige o código e
 * manda de volta para cá, em laço.
 */
export const ROTA_MFA = "/auth/mfa";

export function rotaDeMfa(pathname: string): boolean {
  return ehOuComeca(pathname, [ROTA_MFA]);
}

/**
 * Onde quem cadastrou o segundo fator precisa tê-lo informado nesta sessão: todo o painel e
 * também `/auth/reset`. Esta continua pública (a conta suspensa precisa chegar nela), mas a
 * GoTrue recusa trocar a senha numa sessão aal1 de quem tem fator (`insufficient_aal`): sem
 * passar pelo código antes, o formulário falharia só no envio.
 */
export function rotaExigeSegundoFator(pathname: string): boolean {
  if (rotaDeMfa(pathname)) return false;
  if (ehOuComeca(pathname, ["/auth/reset"])) return true;
  return !rotaPublica(pathname);
}

/**
 * A sessão está no primeiro fator (senha, Google) e a conta tem fator verificado?
 *
 * `proximo` é o `nextLevel` do `getAuthenticatorAssuranceLevel()`: vira `aal2` assim que a
 * conta tem um fator verificado. `atual` é o `aal` do JWT.
 */
export function precisaSegundoFator(nivel: { atual?: string | null; proximo?: string | null }): boolean {
  return nivel.proximo === "aal2" && nivel.atual !== "aal2";
}

export const DESTINO_PADRAO = "/dashboard";

const BASE_FICTICIA = "http://destino.invalido";

/**
 * Para onde ir depois do código. Só caminho interno: `?next=https://golpe.com`, `//golpe.com`
 * ou `/\golpe.com` (que o navegador lê como outro host) virariam um redirecionamento aberto
 * com a cara do nosso domínio. O `new URL` com base fictícia é quem decide: se a origem mudou,
 * o valor apontava para fora — inclusive nas variações com tab, quebra de linha e barra
 * invertida, que o parser normaliza do mesmo jeito que o navegador.
 *
 * Também não volta para a própria tela de código nem para login/cadastro, que dariam laço,
 * nem para `/api` (a requisição que caiu no desvio pode ter sido um `fetch`, e "voltar" para
 * ela mostraria JSON cru na tela).
 */
export function destinoSeguro(bruto: string | null | undefined, padrao: string = DESTINO_PADRAO): string {
  if (!bruto || !bruto.startsWith("/") || bruto.startsWith("//")) return padrao;
  // Caractere de controle (inclui tab e quebra de linha) não tem por que estar num caminho.
  if (/[\u0000-\u001f\u007f]/.test(bruto)) return padrao;
  let url: URL;
  try {
    url = new URL(bruto, BASE_FICTICIA);
  } catch {
    return padrao;
  }
  if (url.origin !== BASE_FICTICIA) return padrao;
  if (rotaDeMfa(url.pathname) || rotaDeEntrada(url.pathname) || ehOuComeca(url.pathname, ["/api", "/_next"])) return padrao;
  return `${url.pathname}${url.search}`;
}
