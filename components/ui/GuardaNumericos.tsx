"use client";

import { useEffect } from "react";

/**
 * Tira o foco de qualquer `<input type="number">` quando a roda do mouse gira sobre ele
 * enquanto está focado — sem isso, rolar a página com o cursor parado em cima de um campo
 * numérico incrementa/decrementa o valor em silêncio (comportamento nativo do navegador em
 * inputs numéricos focados). São 59 campos no projeto; montar isto uma única vez no layout
 * evita editar cada um.
 *
 * `blur()` em vez de `e.preventDefault()` de propósito: o valor para de mudar **e** a
 * página continua rolando. `preventDefault` travaria a rolagem com o cursor sobre o campo.
 */
export function GuardaNumericos() {
  useEffect(() => {
    function aoRolar(e: WheelEvent) {
      const alvo = e.target;
      if (alvo instanceof HTMLInputElement && alvo.type === "number" && document.activeElement === alvo) {
        alvo.blur();
      }
    }
    document.addEventListener("wheel", aoRolar, { passive: true });
    return () => document.removeEventListener("wheel", aoRolar);
  }, []);

  return null;
}
