"use client";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { MODOS } from "@/lib/pricing";
import type { EstadoPrecificacao } from "@/lib/precificacao-estado";

/** Escolha entre margem, markup, lucro em R$ ou preço fixo. Extraído de
 * `PrecificacaoClient.tsx` — ver comentário em `PainelEntradas.tsx`. */
export function PainelModo({ estado }: { estado: EstadoPrecificacao }) {
  const { modo, setModo, margemPct, setMargemPct, markupPct, setMarkupPct, lucroDesejado, setLucroDesejado, precoFixo, setPrecoFixo } =
    estado;

  return (
    <Card>
      <h3 className="text-sm font-medium text-text-primary mb-3">Como calcular o preço</h3>
      <div className="flex gap-2 mb-4 flex-wrap">
        {MODOS.map((m) => (
          <Chip key={m.id} onClick={() => setModo(m.id)} ativo={modo === m.id}>
            {m.label}
          </Chip>
        ))}
      </div>

      {modo === "margem" && (
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Margem Líquida Alvo (%)</label>
          <input
            type="number"
            step="0.1"
            value={margemPct}
            onChange={(e) => setMargemPct(Number(e.target.value) || 0)}
            className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
          />
        </div>
      )}
      {modo === "markup" && (
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Markup sobre o Custo (%)</label>
          <input
            type="number"
            step="0.1"
            value={markupPct}
            onChange={(e) => setMarkupPct(Number(e.target.value) || 0)}
            className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
          />
          <p className="text-xs text-text-tertiary mt-1.5">
            Diferente da margem: markup é o lucro sobre o custo (ex.: 50% de markup num custo de R$ 10 dá R$ 5 de
            lucro), enquanto margem é o lucro sobre o preço de venda.
          </p>
        </div>
      )}
      {modo === "lucro" && (
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Lucro Líquido Desejado (R$)</label>
          <input
            type="number"
            step="0.01"
            value={lucroDesejado}
            onChange={(e) => setLucroDesejado(Number(e.target.value) || 0)}
            className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
          />
        </div>
      )}
      {modo === "preco" && (
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Preço de Venda (R$)</label>
          <input
            type="number"
            step="0.01"
            value={precoFixo}
            onChange={(e) => setPrecoFixo(Number(e.target.value) || 0)}
            className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
          />
        </div>
      )}
    </Card>
  );
}
