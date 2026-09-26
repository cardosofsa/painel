"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

// Evita o warning "useLayoutEffect does nothing on the server": este componente só roda no
// cliente, mas o React ainda emite o aviso durante a renderização inicial no servidor do
// Next. O truque padrão é usar `useEffect` nesse caso e `useLayoutEffect` no navegador, onde
// ele de fato evita o "salto" do indicador aparecendo em {0,0} antes de medir a posição certa.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

/**
 * Barra de abas com indicador deslizante — substitui o padrão que estava copiado (com
 * pequenas diferenças) em `AdminClient.tsx` e `ConfiguracoesClient.tsx`.
 *
 * A posição do indicador é medida a partir do botão ativo (via `data-tab-value`), não
 * calculada por índice: assim funciona igual com abas de larguras diferentes, sem precisar
 * saber a largura de cada rótulo de antemão.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicador, setIndicador] = useState<{ left: number; width: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    function medir() {
      const container = containerRef.current;
      if (!container) return;
      const botaoAtivo = container.querySelector<HTMLButtonElement>(`[data-tab-value="${value}"]`);
      if (botaoAtivo) {
        setIndicador({ left: botaoAtivo.offsetLeft, width: botaoAtivo.offsetWidth });
      }
    }
    medir();
    // Abas com rótulo comprido podem quebrar linha diferente conforme a largura da tela
    // (ex.: sidebar recolhendo/expandindo) — recalcula quando isso acontece.
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [value, tabs]);

  return (
    <div
      ref={containerRef}
      className={`relative flex gap-1 border-b border-border overflow-x-auto overflow-y-hidden ${className}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          data-tab-value={tab.value}
          onClick={() => onChange(tab.value)}
          aria-selected={value === tab.value}
          role="tab"
          className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
            value === tab.value ? "text-accent font-medium" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
      {/* `opacity-0` até a primeira medição: sem isso o indicador nasceria em {0,0} e
          "cresceria" visivelmente até a posição certa no primeiro carregamento da tela. */}
      <div
        className={`absolute bottom-0 h-0.5 bg-accent transition-[left,width] duration-200 ease-out ${
          indicador ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: indicador?.left ?? 0, width: indicador?.width ?? 0 }}
      />
    </div>
  );
}

/**
 * Envolve o conteúdo de uma aba para a troca ter uma transição suave em vez de trocar
 * instantaneamente. Quem chama passa `key` (geralmente o valor da aba ativa) para forçar a
 * remontagem — mesmo padrão de remount-por-key já usado no projeto para resetar formulário.
 *
 * Respeita `prefers-reduced-motion` — a regra fica em `globals.css`, não aqui: quem
 * configurou o sistema para menos movimento não recebe a animação, a troca fica instantânea.
 */
export function TabPanel({ children }: { children: ReactNode }) {
  return <div className="animate-tab-fade">{children}</div>;
}
