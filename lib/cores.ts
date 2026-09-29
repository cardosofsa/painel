/**
 * Contraste de cor, para o teste que guarda os tokens de `app/globals.css`.
 *
 * Fica em `lib/` porque é matemática pura e precisa ser testável — e porque o teste que
 * a usa lê o CSS de verdade, em vez de uma cópia dos valores que envelheceria sozinha.
 */

/** Luminância relativa da WCAG 2.1. Espera `#rrggbb`. */
export function luminancia(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Razão de contraste entre duas cores, de 1 (igual) a 21 (preto sobre branco). */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Extrai as variáveis CSS de um bloco de `globals.css`.
 * `seletor` é o texto exato que abre o bloco, ex.: `:root` ou `:root[data-theme="dark"]`.
 */
export function tokensDoBloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`Bloco "${seletor}" não existe no CSS`);
  const fim = css.indexOf("\n}", inicio);
  const corpo = css.slice(inicio, fim);

  const out: Record<string, string> = {};
  for (const m of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
