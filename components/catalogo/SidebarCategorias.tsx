"use client";

import { Chip, ChipRow } from "@/components/ui/Chip";

export interface CategoriaContada {
  nome: string;
  total: number;
}

/**
 * Categorias do catálogo. No desktop, uma barra lateral (a categoria é a navegação
 * principal de uma loja); no celular, a mesma lista vira uma fileira de chips rolável,
 * porque uma coluna fixa roubaria metade da tela.
 */
export function SidebarCategorias({
  categorias,
  ativa,
  onEscolher,
}: {
  categorias: CategoriaContada[];
  ativa: string;
  onEscolher: (nome: string) => void;
}) {
  // Com uma única categoria (além de "Todas") não há o que navegar.
  if (categorias.length <= 2) return null;

  return (
    <>
      <nav aria-label="Categorias" className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-20">
          <div className="text-xs font-medium tracking-wide text-text-tertiary uppercase mb-2">Categorias</div>
          <ul className="space-y-0.5">
            {categorias.map((c) => (
              <li key={c.nome}>
                <button
                  onClick={() => onEscolher(c.nome)}
                  aria-current={ativa === c.nome ? "true" : undefined}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                    ativa === c.nome
                      ? "bg-accent-soft text-accent font-medium"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }`}
                >
                  <span className="truncate">{c.nome}</span>
                  <span className="text-xs text-text-tertiary shrink-0">{c.total}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <ChipRow className="lg:hidden mb-3">
        {categorias.map((c) => (
          <Chip key={c.nome} ativo={ativa === c.nome} onClick={() => onEscolher(c.nome)}>
            {c.nome} <span className="text-text-tertiary">({c.total})</span>
          </Chip>
        ))}
      </ChipRow>
    </>
  );
}
