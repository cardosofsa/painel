import { ReactNode } from "react";

/**
 * Cabeçalho das telas do painel: título com mais peso, uma linha opcional de explicação
 * embaixo e as ações à direita (que descem para baixo do título no celular).
 */
export function PageHeader({ eyebrow, title, descricao, actions }: { eyebrow?: string; title: string; descricao?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs font-medium uppercase tracking-wide text-accent mb-1">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight leading-tight text-text-primary">{title}</h1>
        {descricao && <p className="mt-1 text-sm text-text-secondary max-w-2xl">{descricao}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
