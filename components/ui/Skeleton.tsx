/** Bloco de carregamento: brilho que passa da esquerda para a direita (`.esqueleto`, globals.css). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`esqueleto rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg bg-surface-1 border border-border shadow-elev-1 p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/**
 * Página inteira carregando, no formato comum do painel: título, uma linha de cartões
 * e uma tabela. Usado pelos `loading.tsx` que não têm um layout próprio a imitar.
 * `titulo={false}` quando o layout da seção já mostra o título (Vixe).
 */
export function PaginaSkeleton({ cards = 3, linhas = 8, titulo = true }: { cards?: number; linhas?: number; titulo?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      {titulo && <Skeleton className="h-8 w-56 mb-6" />}
      {cards > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${cards >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4 mb-5`}>
          {Array.from({ length: cards }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      <div className="rounded-lg bg-surface-1 border border-border">
        <TableSkeleton rows={linhas} />
      </div>
    </div>
  );
}
