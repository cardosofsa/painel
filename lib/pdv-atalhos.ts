/**
 * Atalhos de teclado do PDV e a conta do valor em Pix do checkout. PURO (coberto por
 * `pdv-atalhos.test.ts`): o componente só traduz o `KeyboardEvent` para `TeclaPdv` e executa
 * a ação devolvida.
 */

export type AcaoAtalhoPdv = "buscar" | "cobrar" | "finalizar" | "desconto" | "limpar" | "mais" | "menos";

export interface TeclaPdv {
  /** `KeyboardEvent.key`. */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** Foco num campo que usa a tecla (input de texto/número, textarea, select, contenteditable). */
  emCampo?: boolean;
  /** O checkout (pagamento) está aberto. */
  checkoutAberto?: boolean;
  /** Algum outro modal está aberto (carrinho no celular, variantes, recibo, câmera…). */
  outroModalAberto?: boolean;
}

/** Legenda mostrada em tela larga. */
export const DICA_ATALHOS_PDV = "F2 buscar · F4 cobrar · F8 desconto · + / − quantidade · Esc limpar";

/**
 * Tecla → ação. F-keys valem mesmo com o foco num campo (nenhum campo precisa delas); `+`,
 * `−` e Esc só fora de campo — exceto Esc na busca, que o próprio campo trata. Com Ctrl/Alt/
 * Meta nada é atalho (Ctrl+F, Alt+F4 são do navegador/sistema).
 */
export function acaoDoAtalho(t: TeclaPdv): AcaoAtalhoPdv | null {
  if (t.ctrl || t.alt || t.meta) return null;
  const emModal = !!t.checkoutAberto || !!t.outroModalAberto;

  switch (t.key) {
    case "F2":
      return emModal ? null : "buscar";
    case "F4":
      if (t.checkoutAberto) return "finalizar";
      return t.outroModalAberto ? null : "cobrar";
    case "F8":
      return emModal ? null : "desconto";
  }

  if (t.emCampo || emModal) return null;
  switch (t.key) {
    case "+":
    case "Add":
      return "mais";
    case "-":
    case "−":
    case "Subtract":
      return "menos";
    case "Escape":
      return "limpar";
  }
  return null;
}

/** Tipos de `<input>` que não consomem `+`/`-` (botões, caixas de marcar). */
const INPUT_SEM_TEXTO = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

/** O elemento focado é um campo que usa a tecla digitada? */
export function ehCampoEditavel(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !INPUT_SEM_TEXTO.has((el.type ?? "text").toLowerCase());
  return !!el.isContentEditable;
}

/**
 * Quanto desta venda é recebido em Pix: a entrada (se for Pix) mais o restante (se a forma
 * principal for Pix). Arredondado em centavos; 0 = nada em Pix (não mostra QR).
 */
export function valorEmPix(p: { total: number; entradaValor: number; entradaPix: boolean; formaPrincipalPix: boolean }): number {
  const entrada = Math.min(Math.max(p.entradaValor || 0, 0), Math.max(p.total, 0));
  const restante = Math.max(p.total - entrada, 0);
  const v = (p.entradaPix && entrada > 0 ? entrada : 0) + (p.formaPrincipalPix ? restante : 0);
  return Math.round(v * 100) / 100;
}
