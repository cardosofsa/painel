"use client";

import { useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FILTROS_VAZIOS, type FiltrosCentral, type Pagamento } from "@/lib/pedidos-central";

export type FiltrosExtras = Omit<FiltrosCentral, "periodo" | "canais" | "busca">;

const PAGAMENTOS: { id: Pagamento; rotulo: string }[] = [
  { id: "pago", rotulo: "Pago" },
  { id: "fiado", rotulo: "Crediário" },
  { id: "pendente", rotulo: "A confirmar" },
  { id: "cancelado", rotulo: "Cancelado" },
];

/** Contagem de filtros extras aplicados (para o botão "Filtrar (2)"). */
export function contarExtras(f: FiltrosExtras): number {
  return (
    (f.pagamento.length ? 1 : 0) +
    (f.logistica ? 1 : 0) +
    (f.uf ? 1 : 0) +
    (f.valorMin != null || f.valorMax != null ? 1 : 0) +
    (f.soPrejuizo ? 1 : 0) +
    (f.soSemCusto ? 1 : 0) +
    (f.tag ? 1 : 0)
  );
}

/** Pop-up "Filtrar": escolhe tudo e aplica de uma vez. */
export function FiltrosModal({
  inicial,
  onAplicar,
  onClose,
  ufs,
  logisticas,
  tags = [],
}: {
  tags?: string[];
  inicial: FiltrosExtras;
  onAplicar: (f: FiltrosExtras) => void;
  onClose: () => void;
  ufs: string[];
  logisticas: string[];
}) {
  const [f, setF] = useState<FiltrosExtras>(inicial);
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(",", ".")) || 0));
  const vazio = { pagamento: FILTROS_VAZIOS.pagamento, logistica: "", uf: "", valorMin: null, valorMax: null, soPrejuizo: false, soSemCusto: false, tag: "" };

  return (
    <Modal open onClose={onClose} title="Filtrar pedidos" width="max-w-md">
      <FormField label="Situação do pagamento">
        <div className="flex flex-wrap gap-2">
          {PAGAMENTOS.map((p) => {
            const on = f.pagamento.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setF((x) => ({ ...x, pagamento: on ? x.pagamento.filter((y) => y !== p.id) : [...x.pagamento, p.id] }))}
                className={`text-xs rounded-full border px-3 py-1 ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:bg-surface-2"}`}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Logística">
          <select className={inputClass} value={f.logistica} onChange={(e) => setF((x) => ({ ...x, logistica: e.target.value }))}>
            <option value="">Todas</option>
            {logisticas.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Estado (UF)">
          <select className={inputClass} value={f.uf} onChange={(e) => setF((x) => ({ ...x, uf: e.target.value }))}>
            <option value="">Todos</option>
            {ufs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Valor mínimo (R$)">
          <input className={inputClass} inputMode="decimal" value={f.valorMin ?? ""} onChange={(e) => setF((x) => ({ ...x, valorMin: num(e.target.value) }))} />
        </FormField>
        <FormField label="Valor máximo (R$)">
          <input className={inputClass} inputMode="decimal" value={f.valorMax ?? ""} onChange={(e) => setF((x) => ({ ...x, valorMax: num(e.target.value) }))} />
        </FormField>
      </div>
      {tags.length > 0 && (
        <FormField label="Tag">
          <select className={inputClass} value={f.tag} onChange={(e) => setF((x) => ({ ...x, tag: e.target.value }))}>
            <option value="">Todas</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={f.soPrejuizo} onChange={(e) => setF((x) => ({ ...x, soPrejuizo: e.target.checked }))} /> Só pedidos com prejuízo
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={f.soSemCusto} onChange={(e) => setF((x) => ({ ...x, soSemCusto: e.target.checked }))} /> Só com item sem produto vinculado (sem custo)
        </label>
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={() => setF(vazio)}>
          Limpar
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onAplicar(f);
            onClose();
          }}
        >
          Aplicar filtros
        </Button>
      </div>
    </Modal>
  );
}
