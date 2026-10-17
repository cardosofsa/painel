/**
 * Desenha a capa final NO NAVEGADOR: a cena gerada pela IA + título, selos, faixa e logo
 * calculados por `lib/imagem/layout.ts`. O texto sai sempre com a ortografia que o usuário
 * aprovou e a logo é o arquivo oficial, sem redesenho. Cada arquivo é baixado como blob, então
 * o canvas não fica contaminado por imagem de outra origem.
 */

import { calcularLayout, estiloDaFicha } from "@/lib/imagem/layout";
import type { FichaMarca } from "@/lib/marca/ficha";

export const LADO_CAPA = 1024;
const SERIFADA = 'Georgia, "Times New Roman", serif';
const SEM_SERIFA = 'system-ui, "Segoe UI", Arial, sans-serif';

export interface EntradaComposicao {
  cenaUrl: string;
  titulo: string;
  ficha: FichaMarca;
  textoFaixa: string | null;
  logoUrl: string | null;
}

async function carregar(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { mode: "cors", cache: "force-cache" });
  if (!r.ok) throw new Error("Não consegui abrir uma das imagens.");
  return createImageBitmap(await r.blob());
}

/** Brilho médio (0 a 1) de uma região, amostrada em tamanho reduzido. */
function brilhoMedio(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const dados = ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data;
  let soma = 0;
  let n = 0;
  for (let i = 0; i < dados.length; i += 16) {
    soma += (0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2]) / 255;
    n++;
  }
  return n ? soma / n : 1;
}

export async function comporCapa(e: EntradaComposicao): Promise<Blob> {
  const [cena, logo] = await Promise.all([carregar(e.cenaUrl), e.logoUrl ? carregar(e.logoUrl) : Promise.resolve(null)]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LADO_CAPA;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");

  // Cena em "cover" no quadrado.
  const escala = Math.max(LADO_CAPA / cena.width, LADO_CAPA / cena.height);
  ctx.drawImage(cena, (LADO_CAPA - cena.width * escala) / 2, (LADO_CAPA - cena.height * escala) / 2, cena.width * escala, cena.height * escala);
  cena.close();

  const familia = /serif/i.test(e.ficha.tipografia ?? "") && !/sans/i.test(e.ficha.tipografia ?? "") ? SERIFADA : SEM_SERIFA;
  const medir = (t: string, tamanho: number) => {
    ctx.font = `bold ${tamanho}px ${familia}`;
    return ctx.measureText(t).width;
  };
  const layout = calcularLayout({
    lado: LADO_CAPA,
    titulo: e.titulo,
    maxPalavras: e.ficha.tituloMaxPalavras ?? null,
    selos: e.ficha.selos ?? [],
    temFaixa: !!e.ficha.faixaInferior || !!e.textoFaixa,
    logo: logo && e.ficha.logoPosicao !== "nenhuma" ? { posicao: e.ficha.logoPosicao ?? "inferior_direito", larguraPct: e.ficha.logoLarguraPct ?? 10, proporcao: logo.width / logo.height } : null,
    medir,
  });

  // O topo da cena decide se o título vai escuro ou claro (legibilidade, não gosto).
  const topo = layout.titulo;
  const fundoClaro = brilhoMedio(ctx, 0, 0, LADO_CAPA, Math.ceil(topo.y + topo.h + LADO_CAPA * 0.06)) > 0.5;
  const estilo = estiloDaFicha(e.ficha.paleta, fundoClaro);

  if (layout.faixa) {
    ctx.fillStyle = estilo.corFaixa;
    ctx.fillRect(layout.faixa.x, layout.faixa.y, layout.faixa.w, layout.faixa.h);
    if (e.textoFaixa) {
      let t = layout.faixa.h * 0.4;
      while (t > 12 && medir(e.textoFaixa, t) > layout.faixa.w * 0.9) t -= 2;
      ctx.font = `bold ${t}px ${familia}`;
      ctx.fillStyle = estilo.corTextoFaixa;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.textoFaixa, layout.faixa.x + layout.faixa.w / 2, layout.faixa.y + layout.faixa.h / 2);
    }
  }

  ctx.fillStyle = estilo.corTitulo;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `bold ${layout.tamanhoTitulo}px ${familia}`;
  layout.linhasTitulo.forEach((linha, i) => ctx.fillText(linha, layout.titulo.x + layout.titulo.w / 2, layout.titulo.y + i * layout.tamanhoTitulo * 1.12));

  for (const s of layout.selos) {
    ctx.fillStyle = estilo.corSelo;
    ctx.beginPath();
    ctx.roundRect(s.caixa.x, s.caixa.y, s.caixa.w, s.caixa.h, s.caixa.h / 2);
    ctx.fill();
    ctx.fillStyle = estilo.corTextoSelo;
    ctx.font = `bold ${s.tamanhoFonte}px ${familia}`;
    ctx.textBaseline = "middle";
    ctx.fillText(s.texto, s.caixa.x + s.caixa.w / 2, s.caixa.y + s.caixa.h / 2);
  }

  if (logo && layout.logo) ctx.drawImage(logo, layout.logo.x, layout.logo.y, layout.logo.w, layout.logo.h);
  logo?.close();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui finalizar a imagem."))), "image/png"));
}
