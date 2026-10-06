import type { SVGProps } from "react";

/**
 * Lampião — a marca da Vixe, a assistente do Sertão. Não existe em `lucide-react`; desenhado
 * no mesmo estilo dos ícones ao redor (viewBox 24×24, traço 2, cantos arredondados), como o
 * `IconeCacto`.
 */
export function IconeLampiao({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* alça */}
      <path d="M9.5 4a2.5 2.5 0 0 1 5 0" />
      {/* tampa */}
      <path d="M8 6h8" />
      {/* vidro */}
      <path d="M9 6 7.5 16h9L15 6" />
      {/* chama */}
      <path d="M12 9.5c.9 1 1.2 1.8 1.2 2.5a1.2 1.2 0 0 1-2.4 0c0-.7.3-1.5 1.2-2.5Z" />
      {/* base */}
      <path d="M6 16h12v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3Z" />
    </svg>
  );
}
