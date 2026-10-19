"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHAVE = "painel:anuncio-chat-recolhido";
const EVENTO = "painel:anuncio-chat-mudou";
/** A partir desta largura o chat fica fixo ao lado; abaixo dela abre por cima (gaveta ou tela cheia). */
const LARGO = "(min-width: 1280px)";

/** Sem armazenamento (modo privado), a escolha vale até recarregar a página. */
let naMemoria: boolean | null = null;

function lerRecolhido(): boolean {
  if (naMemoria !== null) return naMemoria;
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function assinarPreferencia(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

function assinarLargura(aviso: () => void) {
  const mq = window.matchMedia(LARGO);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * O chat do anúncio na tela larga: aberto por padrão, e recolher/abrir fica lembrado neste
 * navegador (localStorage com try/catch: modo privado lança). `largo` diz se a tela comporta o
 * painel fixo ao lado. No servidor os dois começam como "tela estreita, aberto", e o cliente
 * corrige depois da hidratação, sem aviso de divergência.
 */
export function usePainelConversa(): { largo: boolean; recolhido: boolean; alternar: () => void } {
  const largo = useSyncExternalStore(assinarLargura, () => window.matchMedia(LARGO).matches, () => false);
  const recolhido = useSyncExternalStore(assinarPreferencia, lerRecolhido, () => false);
  const alternar = useCallback(() => {
    const novo = !lerRecolhido();
    try {
      localStorage.setItem(CHAVE, novo ? "1" : "0");
      naMemoria = null;
    } catch {
      naMemoria = novo;
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return { largo, recolhido, alternar };
}
