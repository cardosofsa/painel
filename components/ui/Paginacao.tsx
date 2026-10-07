"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TAMANHO_PAGINA, totalDePaginas } from "@/lib/listas";

/**
 * Rodapé das listas paginadas no servidor: "1–50 de 312" e Anterior/Próxima. Com uma
 * página só, mostra só a contagem.
 */
export function Paginacao({
  pagina,
  total,
  tamanho = TAMANHO_PAGINA,
  onPagina,
  carregando = false,
  unidade = "itens",
}: {
  pagina: number;
  total: number;
  tamanho?: number;
  onPagina: (pagina: number) => void;
  carregando?: boolean;
  /** Plural do que está sendo contado ("produtos", "clientes"). */
  unidade?: string;
}) {
  if (total <= 0) return null;
  const paginas = totalDePaginas(total, tamanho);
  // A página pode chegar além do fim por um instante (lista encolheu): mostra a última, sem "2 de 1".
  const atual = Math.min(pagina, paginas);
  const de = Math.min(total, (atual - 1) * tamanho + 1);
  const ate = Math.min(total, atual * tamanho);
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-border text-sm">
      <span className="text-text-secondary tabular" aria-live="polite">
        {paginas > 1 ? `${de}–${ate} de ${total} ${unidade}` : `${total} ${unidade}`}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={atual <= 1 || carregando} onClick={() => onPagina(atual - 1)} aria-label="Página anterior">
            <ChevronLeft size={14} aria-hidden /> Anterior
          </Button>
          <span className="text-text-tertiary tabular whitespace-nowrap">
            {atual} de {paginas}
          </span>
          <Button variant="secondary" size="sm" disabled={atual >= paginas || carregando} onClick={() => onPagina(atual + 1)} aria-label="Próxima página">
            Próxima <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      )}
    </nav>
  );
}
