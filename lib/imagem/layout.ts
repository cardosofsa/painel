/**
 * Layout da capa composta por código: onde ficam o título, os selos, a faixa inferior e a
 * logo. PURO, coberto por `layout.test.ts`.
 *
 * A IA de imagem gera só a cena. O texto e a logo são desenhados depois, no navegador, com este
 * layout: assim o título sai sempre com a ortografia certa, a logo oficial nunca é redesenhada
 * e a posição segue a ficha (canto, largura). Medir texto depende do canvas, então quem
 * desenha injeta `medir`; os testes usam uma estimativa.
 */

import type { FichaMarca } from "@/lib/marca/ficha";

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

type PosicaoLogo = NonNullable<FichaMarca["logoPosicao"]>;

export interface EntradaLayout {
  /** Lado da imagem quadrada, em pixels (1024). */
  lado: number;
  titulo: string;
  /** Máximo de palavras do título (da ficha); `null` = sem limite. */
  maxPalavras: number | null;
  selos: string[];
  temFaixa: boolean;
  /** Logo a desenhar; `proporcao` é largura / altura do arquivo. */
  logo: { posicao: PosicaoLogo; larguraPct: number; proporcao: number } | null;
  /** Largura, em pixels, de `texto` no `tamanho` dado. */
  medir: (texto: string, tamanho: number) => number;
}

export interface LayoutCapa {
  linhasTitulo: string[];
  tamanhoTitulo: number;
  titulo: Retangulo;
  selos: { texto: string; caixa: Retangulo; tamanhoFonte: number }[];
  faixa: Retangulo | null;
  logo: Retangulo | null;
  /** Zona livre entre o texto do topo e a faixa, onde o produto deve estar. */
  areaProduto: Retangulo;
  /** O título passou do máximo de palavras e foi cortado. */
  palavrasCortadas: boolean;
  /** Algum selo não coube e saiu. */
  selosOmitidos: number;
}

/** Estimativa de largura (serifada em negrito) para quem não tem canvas. */
export const medirEstimado = (texto: string, tamanho: number) => texto.length * tamanho * 0.52;

function quebrar(palavras: string[], tamanho: number, larguraMax: number, medir: EntradaLayout["medir"]): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (!atual || medir(tentativa, tamanho) <= larguraMax) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function calcularLayout(e: EntradaLayout): LayoutCapa {
  const L = e.lado;
  const margem = L * 0.05;
  const alturaFaixa = e.temFaixa ? L * 0.11 : 0;
  const faixa: Retangulo | null = e.temFaixa ? { x: 0, y: L - alturaFaixa, w: L, h: alturaFaixa } : null;

  // Logo
  let logo: Retangulo | null = null;
  if (e.logo && e.logo.posicao !== "nenhuma" && e.logo.proporcao > 0) {
    const w = (L * e.logo.larguraPct) / 100;
    const h = w / e.logo.proporcao;
    const m = L * 0.04;
    const direita = e.logo.posicao.endsWith("direito");
    const inferior = e.logo.posicao.startsWith("inferior");
    logo = { x: direita ? L - m - w : m, y: inferior ? L - alturaFaixa - m - h : m, w, h };
  }

  // Título: faixa horizontal livre, sem passar por baixo de uma logo no topo.
  let x0 = margem;
  let x1 = L - margem;
  if (logo && logo.y < L / 2) {
    if (logo.x > L / 2) x1 = logo.x - L * 0.02;
    else x0 = logo.x + logo.w + L * 0.02;
  }
  const larguraTitulo = Math.max(L * 0.3, x1 - x0);

  let palavras = e.titulo.split(/\s+/).filter(Boolean);
  let palavrasCortadas = false;
  if (e.maxPalavras && palavras.length > e.maxPalavras) {
    palavras = palavras.slice(0, e.maxPalavras);
    palavrasCortadas = true;
  }

  const temSelos = e.selos.length > 0;
  const alturaMaxTitulo = L * (temSelos ? 0.16 : 0.2);
  let tamanho = L * 0.095;
  const minimo = L * 0.04;
  let linhas = quebrar(palavras, tamanho, larguraTitulo, e.medir);
  for (;;) {
    const maxLinhas = tamanho > L * 0.055 ? 2 : 3;
    const cabe = linhas.length <= maxLinhas && linhas.length * tamanho * 1.12 <= alturaMaxTitulo && linhas.every((l) => e.medir(l, tamanho) <= larguraTitulo);
    if (cabe || tamanho <= minimo) break;
    tamanho = Math.max(minimo, tamanho - L * 0.004);
    linhas = quebrar(palavras, tamanho, larguraTitulo, e.medir);
  }
  const altura = linhas.length * tamanho * 1.12;
  const titulo: Retangulo = { x: x0, y: margem * 0.7, w: larguraTitulo, h: altura };

  // Selos: uma linha de pílulas centrada sob o título; os que não cabem saem do fim.
  const alturaSelo = L * 0.055;
  const fonteSelo = alturaSelo * 0.5;
  const folga = L * 0.015;
  const pad = L * 0.022;
  let larguras = e.selos.map((s) => e.medir(s, fonteSelo) + pad * 2);
  let usados = e.selos.length;
  const total = (n: number) => larguras.slice(0, n).reduce((a, b) => a + b, 0) + folga * Math.max(0, n - 1);
  while (usados > 0 && total(usados) > larguraTitulo) usados--;
  larguras = larguras.slice(0, usados);
  const selos: LayoutCapa["selos"] = [];
  let cursor = x0 + (larguraTitulo - total(usados)) / 2;
  const ySelos = titulo.y + titulo.h + L * 0.012;
  for (let i = 0; i < usados; i++) {
    selos.push({ texto: e.selos[i], caixa: { x: cursor, y: ySelos, w: larguras[i], h: alturaSelo }, tamanhoFonte: fonteSelo });
    cursor += larguras[i] + folga;
  }

  const fimTopo = selos.length ? ySelos + alturaSelo : titulo.y + titulo.h;
  const topoProduto = fimTopo + L * 0.02;
  const baseProduto = (faixa ? faixa.y : L) - L * 0.02;
  return {
    linhasTitulo: linhas,
    tamanhoTitulo: tamanho,
    titulo,
    selos,
    faixa,
    logo,
    areaProduto: { x: margem, y: topoProduto, w: L - 2 * margem, h: Math.max(0, baseProduto - topoProduto) },
    palavrasCortadas,
    selosOmitidos: e.selos.length - usados,
  };
}

// ---------- Cores ----------

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Luminância relativa (WCAG) de #RRGGBB. */
export function luminancia(cor: string): number {
  const [r, g, b] = hex(cor).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Preto ou branco, o que contrastar mais com `fundo`. */
export function corLegivel(fundo: string): "#111111" | "#FFFFFF" {
  const l = luminancia(fundo);
  const comPreto = (l + 0.05) / (luminancia("#111111") + 0.05);
  const comBranco = 1.05 / (l + 0.05);
  return comPreto >= comBranco ? "#111111" : "#FFFFFF";
}

export interface EstiloCapa {
  corTitulo: string;
  corFaixa: string;
  corTextoFaixa: string;
  corSelo: string;
  corTextoSelo: string;
  fundoTitulo: string;
}

/**
 * Cores a partir da paleta da ficha. Sem paleta, neutros legíveis. O título usa a 1ª cor se
 * ela contrastar com o fundo; senão cai para preto ou branco.
 */
export function estiloDaFicha(paleta: readonly string[] | undefined, fundoClaro: boolean): EstiloCapa {
  const fundoTitulo = fundoClaro ? "#FFFFFF" : "#111111";
  const principal = paleta?.[0];
  const secundaria = paleta?.[paleta.length - 1];
  const contrasta = (a: string, b: string) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05) >= 4.5;
  };
  const corFaixa = secundaria ?? "#1F3D2B";
  const corSelo = principal ?? "#1F3D2B";
  return {
    fundoTitulo,
    corTitulo: principal && contrasta(principal, fundoTitulo) ? principal : fundoClaro ? "#111111" : "#FFFFFF",
    corFaixa,
    corTextoFaixa: corLegivel(corFaixa),
    corSelo,
    corTextoSelo: corLegivel(corSelo),
  };
}
