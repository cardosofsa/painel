"use client";

import { Search, X } from "lucide-react";
import { campoBase } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ORDENACOES, filtrosAtivos, type FiltrosVitrine as Filtros, type Ordenacao } from "@/lib/vitrine-catalogo";

/** Converte o texto digitado ("12,50") em número ou null; nunca NaN. */
function numeroOuNulo(texto: string): number | null {
  const n = Number(texto.replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Busca, ordenação e faixa de preço (mínimo e máximo). */
export function FiltrosVitrine({
  filtros,
  onMudar,
  onLimpar,
  resultados,
  limites,
}: {
  filtros: Filtros;
  onMudar: (parcial: Partial<Filtros>) => void;
  onLimpar: () => void;
  resultados: number;
  limites: { min: number; max: number } | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={filtros.busca}
            onChange={(e) => onMudar({ busca: e.target.value })}
            placeholder="Buscar produto…"
            aria-label="Buscar produto"
            className={`${campoBase} w-full pl-9`}
          />
        </div>
        <select
          value={filtros.ordenacao}
          onChange={(e) => onMudar({ ordenacao: e.target.value as Ordenacao })}
          aria-label="Ordenar por"
          className={campoBase}
        >
          {ORDENACOES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {limites && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span className="text-xs">Preço</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-tertiary">R$</span>
            <input
              inputMode="decimal"
              value={filtros.precoMin ?? ""}
              onChange={(e) => onMudar({ precoMin: numeroOuNulo(e.target.value) })}
              placeholder={String(Math.floor(limites.min))}
              aria-label="Preço mínimo"
              className={`${campoBase} w-24`}
            />
            <span className="text-xs text-text-tertiary">até</span>
            <input
              inputMode="decimal"
              value={filtros.precoMax ?? ""}
              onChange={(e) => onMudar({ precoMax: numeroOuNulo(e.target.value) })}
              placeholder={String(Math.ceil(limites.max))}
              aria-label="Preço máximo"
              className={`${campoBase} w-24`}
            />
          </div>
          {filtrosAtivos(filtros) && (
            <Button variant="ghost" size="sm" onClick={onLimpar}>
              <X size={14} />
              Limpar filtros
            </Button>
          )}
          <span className="ml-auto text-xs text-text-tertiary" aria-live="polite">
            {resultados} {resultados === 1 ? "produto" : "produtos"}
          </span>
        </div>
      )}
    </div>
  );
}
