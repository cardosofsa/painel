"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { campoBase } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";

/**
 * Barra de filtros padrão das listas. Separa os TIPOS de filtro em vez de empilhar chips:
 * busca à esquerda, seleções compactas (categoria, armazém, período…) ao lado, e os chips
 * de situação numa linha própria, com rótulo. Antes cada tela inventava o seu arranjo e
 * Produtos tinha duas fileiras de chips sem dizer o que cada uma filtrava.
 */
export function BarraFiltros({
  busca,
  onBusca,
  placeholder = "Buscar…",
  ativos,
  onLimpar,
  children,
  situacao,
}: {
  busca: string;
  onBusca: (v: string) => void;
  placeholder?: string;
  /** Quantos filtros além da busca estão ligados (mostra "Limpar"). */
  ativos: number;
  onLimpar: () => void;
  /** Selects compactos (`FiltroSelect`). */
  children?: ReactNode;
  /** Linha de chips (`FiltroChips`). */
  situacao?: ReactNode;
}) {
  const algum = ativos > 0 || busca.trim() !== "";
  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem] sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${campoBase} w-full pl-9`} />
        </label>
        {children}
        {algum && (
          <button type="button" onClick={onLimpar} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary px-2 h-9">
            <X size={14} /> Limpar
          </button>
        )}
      </div>
      {situacao}
    </div>
  );
}

export function FiltroSelect<T extends string>({
  rotulo,
  valor,
  onChange,
  opcoes,
  todos = "Todos",
}: {
  rotulo: string;
  valor: T | "";
  onChange: (v: T | "") => void;
  opcoes: { valor: T; rotulo: string }[];
  /** Texto da opção "sem filtro". */
  todos?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-xs text-text-tertiary whitespace-nowrap">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as T | "")}
        className={`${campoBase} max-w-[12rem] ${valor ? "border-accent text-accent" : ""}`}
        aria-label={rotulo}
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FiltroChips<T extends string>({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; rotulo: string; quantidade?: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={rotulo}>
      <span className="text-xs text-text-tertiary mr-1">{rotulo}</span>
      {opcoes.map((o) => (
        <Chip key={o.valor} ativo={valor === o.valor} onClick={() => onChange(o.valor)}>
          {o.rotulo}
          {o.quantidade != null && <span className="ml-1 text-xs opacity-70 tabular">{o.quantidade}</span>}
        </Chip>
      ))}
    </div>
  );
}
