import type { ReactNode } from "react";

/**
 * Faixa de abertura da aba Anúncio: superfície escura de marca (tokens `--marca-*`, que ficam
 * escuros nos dois temas), título grande e um bloco de ação à direita.
 */
export function AberturaMarca({ eyebrow, titulo, texto, children }: { eyebrow: string; titulo: string; texto?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-marca-fundo text-marca-texto shadow-elev-2 mb-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-marca-realce opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -right-4 top-20 h-40 w-40 rounded-full border border-marca-borda" />
      <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
        <div className="min-w-0 max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-marca-sol mb-2">{eyebrow}</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{titulo}</h1>
          {texto && <p className="mt-2 text-sm sm:text-base text-marca-texto-suave">{texto}</p>}
        </div>
        {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
      </div>
    </section>
  );
}
