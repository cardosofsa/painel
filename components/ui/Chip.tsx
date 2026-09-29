"use client";

import { ReactNode } from "react";

/**
 * Chip de filtro — a peça que o projeto reinventava em oito medidas diferentes.
 *
 * `ProdutosClient` chegava a ter duas fileiras de filtro, uma embaixo da outra, com
 * `h-9 px-3 rounded-md` na de categorias e `h-7 px-2.5 rounded-full` na de status. O mesmo
 * padrão aparecia em Precificação (três variações), Financeiro e Vendas — esta última sem
 * o `font-medium` que as outras tinham.
 *
 * Usa `aria-pressed` em vez de só pintar o fundo: para quem navega por leitor de tela, a
 * cor não diz que o filtro está ligado.
 */
export function Chip({
  ativo,
  onClick,
  children,
  titulo,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Explicação para o `title`/`aria-label` quando o rótulo é curto demais. */
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={titulo}
      className={`h-8 max-sm:h-9 px-3 rounded-full border text-sm whitespace-nowrap transition-colors duration-[--duracao-rapida] ${
        ativo
          ? "bg-accent-soft border-accent-soft text-accent font-medium"
          : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Fileira de chips. Rola na horizontal no celular em vez de quebrar em três linhas e
 * empurrar o conteúdo da tela para baixo.
 */
export function ChipRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5 ${className}`}>{children}</div>
  );
}
