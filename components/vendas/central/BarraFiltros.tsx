"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { SeletorPeriodo } from "@/components/ui/SeletorPeriodo";
import type { Periodo } from "@/lib/periodo";
import type { LojaMarketplace } from "@/components/vendas/marketplace/ImportarShopeeModal";
import { FiltroCanais } from "./FiltroCanais";

/** Período, canais/lojas, busca e "Filtrar" da central de pedidos. */
export function BarraFiltros({
  periodo,
  onPeriodo,
  diasJanela,
  canais,
  onCanais,
  lojas,
  catalogos,
  busca,
  onBusca,
  nExtras,
  onFiltrar,
  onLimpar,
}: {
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  diasJanela: number;
  canais: string[];
  onCanais: (c: string[]) => void;
  lojas: LojaMarketplace[];
  catalogos: string[];
  busca: string;
  onBusca: (b: string) => void;
  nExtras: number;
  onFiltrar: () => void;
  onLimpar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <SeletorPeriodo valor={periodo} onChange={onPeriodo} limiteDias={diasJanela} />
      <FiltroCanais valor={canais} onChange={onCanais} lojas={lojas} catalogos={catalogos} />
      <div className="relative flex-1 min-w-[12rem] max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input className={`${inputClass} pl-9`} value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="Nº do pedido, cliente, produto ou SKU…" aria-label="Buscar pedidos" />
      </div>
      <Button variant={nExtras ? "primary" : "secondary"} onClick={onFiltrar}>
        <SlidersHorizontal size={14} /> Filtrar{nExtras ? ` (${nExtras})` : ""}
      </Button>
      {(nExtras > 0 || canais.length > 0 || busca) && (
        <button type="button" className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1" onClick={onLimpar}>
          <X size={12} /> Limpar filtros
        </button>
      )}
    </div>
  );
}
