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

function hexParaRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbParaHex([r, g, b]: [number, number, number]): string {
  const canal = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

/** Mistura duas cores em RGB linear. `fracaoB = 0` devolve `a`; `1` devolve `b`. */
export function misturar(a: string, b: string, fracaoB: number): string {
  const [ra, ga, ba] = hexParaRgb(a);
  const [rb, gb, bb] = hexParaRgb(b);
  const f = Math.max(0, Math.min(1, fracaoB));
  return rgbParaHex([ra + (rb - ra) * f, ga + (gb - ga) * f, ba + (bb - ba) * f]);
}

function hexParaHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexParaRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s * 100, l * 100];
}

function hslParaHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbParaHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

/**
 * Escurece ou clareia `cor` até passar `alvo` de contraste contra `fundo` — sem trocar o
 * matiz, só a luminosidade. É o que impede a IA de sugerir um tema ilegível: um texto
 * cinza-claro sobre fundo branco é corrigido aqui, silenciosamente, em vez de publicado.
 *
 * A direção (escurecer ou clarear) segue a luminância do fundo: contra fundo claro,
 * escurece; contra fundo escuro, clareia. É a mesma lógica intuitiva do WCAG, e evita uma
 * busca nas duas direções que poderia "vazar" para o lado errado do matiz.
 */
export function ajustarParaContraste(cor: string, fundo: string, alvo = 4.5): string {
  if (contraste(cor, fundo) >= alvo) return cor;

  const [h, s] = hexParaHsl(cor);
  let l = hexParaHsl(cor)[2];
  const escurecendo = luminancia(fundo) > 0.5;

  for (let i = 0; i < 100; i++) {
    l = escurecendo ? Math.max(0, l - 1) : Math.min(100, l + 1);
    const candidato = hslParaHex(h, s, l);
    if (contraste(candidato, fundo) >= alvo || l <= 0 || l >= 100) return candidato;
  }
  return hslParaHex(h, s, l);
}

/** As quatro cores que o dono escolhe (ou a IA sugere) para a vitrine. */
export interface TemaBase {
  corPrimaria: string;
  corFundo: string;
  corSuperficie: string;
  corTexto: string;
}

/** O conjunto completo de tokens que `app/vitrine/[slug]/layout.tsx` aplica por `style`. */
export interface TokensDerivados {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentOn: string;
  background: string;
  surface1: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
}

/**
 * Deriva o restante da paleta a partir das quatro cores base.
 *
 * O dono (ou a IA) só escolhe 4 cores; o resto — borda, texto secundário, hover do botão,
 * fundo suave do accent, cor do texto dentro do botão — precisa existir para a vitrine
 * inteira funcionar, e cada um que aparece como TEXTO passa por `ajustarParaContraste`.
 * Sem isso, uma cor de marca mais clara (comum em logo) viraria texto ilegível assim que
 * herdasse o lugar de `--text-secondary`.
 */
export function derivarTokens(base: TemaBase): TokensDerivados {
  const accent = ajustarParaContraste(base.corPrimaria, base.corSuperficie, 4.5);
  const accentOn = contraste("#ffffff", accent) >= contraste("#18181b", accent) ? "#ffffff" : "#18181b";
  const escurecendo = luminancia(base.corSuperficie) > 0.5;
  const [h, s, l] = (() => {
    const hsl = hexParaHsl(accent);
    return [hsl[0], hsl[1], escurecendo ? Math.max(0, hsl[2] - 8) : Math.min(100, hsl[2] + 8)] as const;
  })();
  const accentHover = hslParaHex(h, s, l);
  const accentSoft = misturar(base.corSuperficie, accent, 0.12);

  const textPrimary = ajustarParaContraste(base.corTexto, base.corSuperficie, 4.5);
  const textSecondary = ajustarParaContraste(misturar(textPrimary, base.corSuperficie, 0.35), base.corSuperficie, 4.5);
  const textTertiary = ajustarParaContraste(misturar(textPrimary, base.corSuperficie, 0.55), base.corSuperficie, 4.5);
  const border = misturar(base.corSuperficie, textPrimary, 0.15);

  return {
    accent,
    accentHover,
    accentSoft,
    accentOn,
    background: base.corFundo,
    surface1: base.corSuperficie,
    border,
    textPrimary,
    textSecondary,
    textTertiary,
  };
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
