/**
 * Remonta a cada navegação dentro do painel: o conteúdo novo entra com um esmaecer curto
 * (só opacidade, sem transform, para não virar bloco de contenção de modal `fixed`).
 * `prefers-reduced-motion` zera a animação no globals.css.
 */
export default function PainelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-esmaecer">{children}</div>;
}
