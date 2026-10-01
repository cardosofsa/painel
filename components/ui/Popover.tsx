"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Painel que abre embaixo de um botão (período, canais...). Fecha com clique fora ou Esc.
 * `children` recebe `fechar` para os botões "Aplicar".
 */
export function Popover({
  rotulo,
  children,
  alinhar = "esquerda",
  largura = "w-80",
  className = "",
  ativo = false,
}: {
  rotulo: ReactNode;
  children: (fechar: () => void) => ReactNode;
  alinhar?: "esquerda" | "direita";
  largura?: string;
  className?: string;
  /** Destaca o botão (há filtro aplicado). */
  ativo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`h-9 inline-flex items-center gap-1.5 rounded-md border px-3 text-sm whitespace-nowrap ${ativo ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-1 text-text-primary hover:bg-surface-2"}`}
      >
        {rotulo}
      </button>
      {aberto && (
        <div
          className={`absolute z-40 mt-1 ${alinhar === "direita" ? "right-0" : "left-0"} ${largura} max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface-1 shadow-elev-2 p-3`}
        >
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}
