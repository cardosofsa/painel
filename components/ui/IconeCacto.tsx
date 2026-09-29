import type { SVGProps } from "react";

/**
 * Cacto — não existe em `lucide-react` (checado na versão instalada, 1.45.0). Desenhado no
 * mesmo estilo dos ícones lucide ao redor (viewBox 24×24, traço 2, cantos arredondados) pra
 * não destoar. É a marca do SERTÃO, no lugar do antigo ícone `Brain`.
 */
export function IconeCacto({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
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
      <path d="M12 21V4" />
      <path d="M12 15H9a2 2 0 0 1-2-2V9" />
      <path d="M12 11h3a2 2 0 0 0 2-2V5" />
      <path d="M7 21h10" />
    </svg>
  );
}
