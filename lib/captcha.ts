/**
 * Captcha opcional (Cloudflare Turnstile) do login, do cadastro e da recuperação de senha.
 *
 * Liga só com `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (chave pública do widget). Sem ela nada muda:
 * o widget não aparece, a CSP não abre origem nova e as chamadas ao Supabase Auth seguem sem
 * `captchaToken`. A validação de verdade é do Supabase (Auth → Bot protection, com a chave
 * secreta do Turnstile): ligar a variável sem ligar lá só mostra o widget; ligar lá sem a
 * variável recusa todo login. Passo a passo em `docs/seguranca-login.md`.
 *
 * Puro de propósito: importado pela CSP (`lib/csp.ts`, roda no proxy) e pelas telas.
 */

export const ORIGEM_TURNSTILE = "https://challenges.cloudflare.com";

/** `render=explicit`: o widget é desenhado pelo componente, onde e quando ele quiser. */
export const SCRIPT_TURNSTILE = `${ORIGEM_TURNSTILE}/turnstile/v0/api.js?render=explicit`;

/**
 * A chave pública, ou null. Lida com o nome literal porque é assim que o Next a embute no
 * bundle do navegador (acesso dinâmico a `process.env` vira `undefined` no cliente).
 */
export function chaveCaptcha(): string | null {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return chave ? chave : null;
}

export function captchaAtivo(chave: string | null = chaveCaptcha()): boolean {
  return !!chave;
}

/** Pedaço de `options` das chamadas do Supabase Auth. Sem token, não manda o campo. */
export function opcoesCaptcha(token: string | null | undefined): { captchaToken?: string } {
  return token ? { captchaToken: token } : {};
}

/** Com o captcha ligado, só envia o formulário depois que o widget devolveu um token. */
export function faltaCaptcha(token: string | null | undefined, ativo: boolean = captchaAtivo()): boolean {
  return ativo && !token;
}

export const MENSAGEM_FALTA_CAPTCHA = "Aguarde a verificação contra robôs terminar (ou marque a caixa) e tente de novo.";
