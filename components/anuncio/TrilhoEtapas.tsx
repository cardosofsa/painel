"use client";

import { Check, Lock } from "lucide-react";
import type { EtapaCalculada, EtapaId } from "@/lib/anuncio/etapas";

/**
 * Trilho das etapas do Anúncio Infinito: vertical no computador, em fila rolável no celular.
 * O estado (feita / atual / travada) vem de `calcularEtapas`; cor nunca é o único sinal, cada
 * etapa tem número, ícone e texto.
 */
export function TrilhoEtapas({ etapas, atual, onEscolher }: { etapas: EtapaCalculada[]; atual: EtapaId; onEscolher: (id: EtapaId) => void }) {
  return (
    <nav aria-label="Etapas do anúncio">
      <ol className="flex lg:flex-col gap-2 lg:gap-0 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
        {etapas.map((e, i) => {
          const ativa = e.id === atual;
          const ultima = i === etapas.length - 1;
          return (
            <li key={e.id} className="relative shrink-0 lg:shrink">
              {/* Linha que liga as etapas (só no vertical). */}
              {!ultima && <span aria-hidden className={`hidden lg:block absolute left-[1.15rem] top-10 bottom-0 w-px ${e.feita ? "bg-accent" : "bg-border"}`} />}
              <button
                type="button"
                onClick={() => e.liberada && onEscolher(e.id)}
                disabled={!e.liberada}
                aria-current={ativa ? "step" : undefined}
                title={e.motivo ?? undefined}
                className={`relative flex items-center lg:items-start gap-3 w-full text-left rounded-lg px-2 py-2 lg:pb-5 transition-colors ${
                  ativa ? "bg-accent-soft" : e.liberada ? "hover:bg-surface-2" : "opacity-60 cursor-not-allowed"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-mono font-semibold ${
                    e.feita ? "bg-accent text-accent-on border-accent" : ativa ? "border-accent text-accent bg-surface-1" : "border-border text-text-secondary bg-surface-1"
                  }`}
                >
                  {e.feita ? <Check size={15} aria-hidden /> : e.liberada ? i + 1 : <Lock size={13} aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm whitespace-nowrap lg:whitespace-normal ${ativa ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>{e.rotulo}</span>
                  <span className="hidden lg:block text-xs text-text-secondary">{e.feita ? "Feito" : (e.motivo ?? e.ajuda)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
