"use client";

import { ETAPAS, type Etapa } from "@/lib/pedidos-central";

/**
 * Menu de etapas com contagem (como no ERP): coluna à esquerda no computador, barra
 * rolável no celular. "Aguardando pagamento" só aparece quando há algum.
 */
export function MenuEtapas({
  valor,
  onChange,
  contagem,
}: {
  valor: Etapa | "todos" | "oculto";
  onChange: (e: Etapa | "todos" | "oculto") => void;
  contagem: Record<Etapa | "todos" | "oculto", number>;
}) {
  const itens = [
    ...ETAPAS.filter((e) => e.id !== "pagamento" || contagem.pagamento > 0),
    { id: "todos" as const, rotulo: "Todos", pendente: false },
    ...(contagem.oculto > 0 || valor === "oculto" ? [{ id: "oculto" as const, rotulo: "Oculto", pendente: false }] : []),
  ];
  return (
    <nav aria-label="Etapas dos pedidos" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
      {itens.map((e) => {
        const ativo = valor === e.id;
        const n = contagem[e.id] ?? 0;
        return (
          <button
            key={e.id}
            type="button"
            aria-current={ativo ? "true" : undefined}
            onClick={() => onChange(e.id)}
            className={`shrink-0 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-left whitespace-nowrap ${ativo ? "bg-accent-soft text-accent font-medium" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"}`}
          >
            <span>{e.rotulo}</span>
            <span className={`text-xs font-mono ${n > 0 && e.pendente ? "text-accent font-semibold" : "text-text-tertiary"}`}>{n}</span>
          </button>
        );
      })}
    </nav>
  );
}
