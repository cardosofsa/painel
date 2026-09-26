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
 *
 * Segue o padrão WAI-ARIA de abas: `role="tablist"` no contêiner, `role="tab"` +
 * `aria-selected` em cada botão, e seta esquerda/direita/Home/End move o foco E ativa a aba
 * (ativação automática — é o comportamento esperado para um conjunto pequeno de abas como
 * este, ao contrário do padrão "ativação manual" usado quando trocar de aba é caro).
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

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.value === value);
    if (idx === -1) return;
    let proximo = -1;
    if (e.key === "ArrowRight") proximo = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") proximo = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") proximo = 0;
    else if (e.key === "End") proximo = tabs.length - 1;
    else return;

    e.preventDefault();
    const aba = tabs[proximo];
    onChange(aba.value);
    containerRef.current?.querySelector<HTMLButtonElement>(`[data-tab-value="${aba.value}"]`)?.focus();
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      onKeyDown={aoTeclar}
      className={`relative flex gap-1 border-b border-border overflow-x-auto overflow-y-hidden ${className}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          id={`tab-${tab.value}`}
          data-tab-value={tab.value}
          onClick={() => onChange(tab.value)}
          role="tab"
          aria-selected={value === tab.value}
          aria-controls={`painel-${tab.value}`}
          // Só a aba ativa entra na ordem de Tab do teclado — as demais se alcança com as
          // setas, que é o padrão WAI-ARIA para um conjunto de abas.
          tabIndex={value === tab.value ? 0 : -1}
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
 * `tabValue`, quando passado, liga o painel ao botão correspondente
 * (`id="tab-X"`/`aria-controls="painel-X"` já saem prontos de `Tabs` acima) — opcional
 * porque nem todo `TabPanel` está necessariamente emparelhado com um `Tabs` (é só um
 * wrapper de transição por si só).
 *
 * Respeita `prefers-reduced-motion` — a regra fica em `globals.css`, não aqui: quem
 * configurou o sistema para menos movimento não recebe a animação, a troca fica instantânea.
 */
export function TabPanel({ children, tabValue }: { children: ReactNode; tabValue?: string }) {
  return (
    <div
      role={tabValue ? "tabpanel" : undefined}
      id={tabValue ? `painel-${tabValue}` : undefined}
      aria-labelledby={tabValue ? `tab-${tabValue}` : undefined}
      className="animate-tab-fade"
    >
      {children}
    </div>
  );
}
