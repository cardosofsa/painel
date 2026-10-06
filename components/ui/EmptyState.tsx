import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Estado vazio com a ilustração da marca: o ícone dentro de um "sol" (círculo do accent
 * suave) sobre uma duna. Tudo em tokens, então segue o tema sozinho; a ilustração é
 * decorativa (`aria-hidden`), quem dá o recado é o título.
 */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 animate-esmaecer">
      <div className="relative mb-4 w-28 h-20" aria-hidden>
        <svg viewBox="0 0 112 80" className="absolute inset-0 w-full h-full [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]">
          <path d="M0 66 C 22 52, 44 52, 60 60 S 96 72, 112 62 L112 80 L0 80 Z" className="fill-surface-2" />
          <path d="M0 72 C 30 64, 52 66, 74 72 S 102 78, 112 74 L112 80 L0 80 Z" className="fill-border" opacity="0.6" />
        </svg>
        <span className="absolute left-1/2 top-0 -translate-x-1/2 w-14 h-14 rounded-full bg-accent-soft text-accent flex items-center justify-center">
          <Icon size={24} />
        </span>
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>
      {description && <p className="text-sm text-text-secondary max-w-sm mb-4 leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}
