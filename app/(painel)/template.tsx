import { ViewTransition } from "react";

/**
 * Remonta a cada navegação dentro do painel. O conteúdo novo entra com um esmaecer curto pela
 * View Transitions API (a navegação do Next já é uma transição do React, então não precisa de
 * configuração). Só a área da página anima: menu e cabeçalho ficam parados. A duração e o
 * `prefers-reduced-motion` estão no `globals.css`; sem suporte do navegador, a página só troca.
 */
export default function PainelTemplate({ children }: { children: React.ReactNode }) {
  return <ViewTransition>{children}</ViewTransition>;
}
