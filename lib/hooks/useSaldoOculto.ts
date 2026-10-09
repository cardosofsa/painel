"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHAVE = "painel:saldo-oculto";
const EVENTO = "painel:saldo-oculto-mudou";

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

function assinar(aviso: () => void) {
  window.addEventListener("storage", aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

/**
 * "Esconder saldo" (o olho do Dashboard). Preferência só deste navegador: guardada em
 * localStorage (com try/catch: modo privado e site data bloqueado lançam) e lida por
 * `useSyncExternalStore`, então o servidor desenha o saldo visível e o cliente corrige logo
 * depois da hidratação, sem aviso de divergência.
 */
export function useSaldoOculto(): [boolean, () => void] {
  const oculto = useSyncExternalStore(assinar, ler, () => false);
  const alternar = useCallback(() => {
    try {
      localStorage.setItem(CHAVE, ler() ? "0" : "1");
    } catch {
      /* sem armazenamento: o clique não persiste, e a tela segue como está */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [oculto, alternar];
}
