/**
 * Content-Security-Policy do app.
 *
 * Os demais cabeçalhos de segurança são estáticos e moram em `next.config.ts`. Este aqui
 * não pode morar lá porque carrega um nonce novo a cada requisição — por isso é montado no
 * `proxy.ts`.
 *
 * O ganho real está em `script-src`: com nonce + `strict-dynamic`, um XSS que consiga
 * injetar `<script>` na página não executa, porque não tem como adivinhar o nonce do
 * carregamento. É a única defesa que sobra depois que o dado já entrou no HTML.
 */

import { captchaAtivo, ORIGEM_TURNSTILE } from "./captcha";
import { ORIGEM_VIDEO_EMBED, ORIGEM_VIDEO_MINIATURA, videoDemoAtivo } from "./landing";

/** CDNs das fotos dos anúncios (Shopee: susercontent/shopee; Mercado Livre: mlstatic). */
const ORIGENS_IMAGEM_MARKETPLACE = ["https://*.susercontent.com", "https://*.shopee.com.br", "https://*.mlstatic.com"];

/**
 * Este `new URL(...)` roda no `import` do módulo, e o módulo é importado pelo `proxy.ts` —
 * ou seja, roda em TODA requisição, antes mesmo do middleware começar a executar. Uma env
 * ausente na Vercel é `undefined` (cai no `""` acima); mas uma env **presente e malformada**
 * (espaço, aspas coladas, falta o `https://`) faz `new URL()` lançar de forma síncrona no
 * carregamento do módulo — e como não há nenhum request em andamento ainda para capturar o
 * erro, o runtime Edge derruba a função inteira. Toda rota que passa pelo proxy (ou seja,
 * quase todas, pelo matcher abaixo) vira "Internal Server Error" em texto puro, sem
 * exceção — foi exatamente isso que aconteceu em produção.
 *
 * O `try/catch` é o que impede uma env mal configurada de tirar o site do ar inteiro: na
 * pior hipótese, a CSP fica sem a origem do Supabase liberada (upload de imagem e chamada
 * à API quebram, com aviso no console), mas a aplicação continua respondendo.
 */
export function origemSupabaseSegura(): string {
  const bruto = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!bruto) return "";
  try {
    return new URL(bruto).origin;
  } catch {
    console.error("[csp] NEXT_PUBLIC_SUPABASE_URL inválida:", JSON.stringify(bruto));
    return "";
  }
}

const ORIGEM_SUPABASE = origemSupabaseSegura();

/** Rota que recebe as violações. Pública — o navegador a chama sem sessão. */
export const ROTA_RELATORIO = "/api/csp-report";
const GRUPO_RELATORIO = "csp";

/**
 * Cabeçalho `Reporting-Endpoints`, que dá nome ao grupo usado em `report-to`. Vai junto
 * da CSP, no `proxy.ts`. Sem ele o `report-to` não tem para onde apontar.
 */
export function cabecalhoRelatorio(): string {
  return `${GRUPO_RELATORIO}="${ROTA_RELATORIO}"`;
}

/**
 * 16 bytes de aleatoriedade criptográfica em base64. `crypto.getRandomValues` e `btoa` são
 * ambos nativos no runtime do proxy — evita depender de `Buffer`, que não existe lá.
 */
export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function montarCsp(
  nonce: string,
  opcoes: { dev?: boolean; origemSupabase?: string; captcha?: boolean; video?: boolean } = {},
): string {
  const { dev = process.env.NODE_ENV !== "production", origemSupabase = ORIGEM_SUPABASE, captcha = captchaAtivo(), video = videoDemoAtivo() } = opcoes;

  const diretivas: Record<string, (string | false)[]> = {
    "default-src": ["'self'"],

    // `strict-dynamic` faz o navegador ignorar 'self' aqui e confiar só no que for
    // carregado por um script já autorizado pelo nonce — que é exatamente como o Next
    // carrega os próprios chunks. Em dev o Fast Refresh compila no navegador, daí o
    // 'unsafe-eval'; em produção ele não entra.
    //
    // Captcha (Turnstile, só com `NEXT_PUBLIC_TURNSTILE_SITE_KEY`): o script dele é inserido
    // por um componente nosso, então o `strict-dynamic` já o autoriza. A origem aqui é a
    // reserva do navegador antigo, que não entende `strict-dynamic` e decide pela lista.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", dev && "'unsafe-eval'", captcha && ORIGEM_TURNSTILE],

    // `unsafe-inline` aqui é inevitável e de baixo risco: o next/font injeta <style> no
    // head e Recharts/Tailwind escrevem `style=""` direto no elemento. CSS injetado não
    // executa código — o vetor sério está em script-src, que está fechado.
    "style-src": ["'self'", "'unsafe-inline'"],

    // blob:/data: cobrem o preview local de imagem e o download de CSV/backup.
    // Vídeo da landing (só com `NEXT_PUBLIC_VIDEO_DEMO_URL`): a miniatura da fachada.
    // Fotos dos anúncios (Mapeamento de Anúncio): CDN da Shopee e do Mercado Livre. Só imagem.
    "img-src": ["'self'", "blob:", "data:", origemSupabase, video && ORIGEM_VIDEO_MINIATURA, ...ORIGENS_IMAGEM_MARKETPLACE],

    // next/font baixa a fonte no build e serve de /_next/static — nada de Google Fonts em
    // tempo de execução.
    "font-src": ["'self'"],

    // REST, Auth e Storage do Supabase. Em dev entra o websocket do Fast Refresh.
    "connect-src": ["'self'", origemSupabase, dev && "ws:"],

    "worker-src": ["'self'", "blob:"],

    // O desafio do Turnstile roda num iframe da Cloudflare; o vídeo da landing, num iframe do
    // youtube-nocookie (só depois do clique no play). Sem nenhum dos dois, a diretiva nem sai
    // e vale o `default-src 'self'` de sempre.
    ...(captcha || video ? { "frame-src": ["'self'", captcha && ORIGEM_TURNSTILE, video && ORIGEM_VIDEO_EMBED] } : {}),

    // Espelha o X-Frame-Options: DENY do next.config.ts, para navegador que já ignora o
    // cabeçalho antigo.
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],

    // Impede que um <base> injetado reescreva o destino de todo caminho relativo da página.
    "base-uri": ["'self'"],

    // Nenhum formulário do app posta para fora — inclusive os server actions são same-origin.
    "form-action": ["'self'"],
  };

  /**
   * Sem `upgrade-insecure-requests` de propósito. Ele não teria o que fazer aqui: todo
   * recurso do app é da própria origem (https em produção, garantido pelo HSTS do
   * `next.config.ts`) ou o Supabase, que já entra como https literal nas diretivas acima.
   * Em compensação ele atrapalha de verdade ao rodar a build de produção local: o prefetch
   * do Next para http://localhost vira https://localhost e morre com ERR_SSL_PROTOCOL_ERROR,
   * porque não há TLS na máquina.
   */

  const politica = Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.filter((v): v is string => Boolean(v)).join(" ")}`)
    .join("; ");

  /**
   * Sem relatório, uma CSP quebrada é silenciosa: o recurso some da tela e ninguém fica
   * sabendo. Em dev o console do navegador já mostra; em produção, não há console nenhum
   * para olhar — daí o endpoint, que só existe fora de dev.
   *
   * `report-uri` está obsoleto mas ainda é o único que o Safari entende; `report-to` é o
   * substituto. Mandar os dois é a prática atual, e o navegador escolhe um.
   */
  if (dev) return politica;
  return `${politica}; report-uri ${ROTA_RELATORIO}; report-to ${GRUPO_RELATORIO}`;
}
