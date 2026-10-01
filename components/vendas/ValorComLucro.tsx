"use client";

import { formatBRL } from "@/lib/format";
import type { DecomposicaoVenda } from "@/lib/vendas-painel";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Valor do pedido com lucro e margem embaixo; passando o mouse (ou focando com o teclado)
 * abre a conta inteira: receita, desconto, frete, custo dos produtos, impostos/taxas e lucro.
 * Compacto de propósito — a lista não pode virar planilha.
 */
export function ValorComLucro({ valor, d, apagado = false, taxasPlataforma }: { valor: number; d: DecomposicaoVenda; apagado?: boolean; taxasPlataforma?: number | null }) {
  const positivo = d.lucro >= 0;
  return (
    <div className="relative group inline-block text-right" tabIndex={0} aria-label={`Valor ${formatBRL(valor)}, lucro ${formatBRL(d.lucro)}`}>
      <div className={`font-mono ${apagado ? "text-text-tertiary line-through" : "text-text-primary"}`}>{formatBRL(valor)}</div>
      {!apagado && (
        <div className={`text-[11px] font-medium ${positivo ? "text-positive" : "text-negative"}`}>
          {formatBRL(d.lucro)} · {pct(d.margem)}
        </div>
      )}
      {!apagado && (
        <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute right-0 top-full mt-1 z-30 w-60 rounded-md border border-border bg-surface-1 shadow-elev-2 p-3 text-left text-xs">
          <Linha rotulo="Receita dos produtos" valor={d.receita} />
          {d.desconto > 0 && <Linha rotulo="Desconto" valor={-d.desconto} />}
          {d.entrega > 0 && <Linha rotulo="Frete cobrado" valor={d.entrega} />}
          <div className="border-t border-border my-1.5" />
          {taxasPlataforma != null && taxasPlataforma > 0 && <Linha rotulo="Taxas da plataforma" valor={-taxasPlataforma} />}
          <Linha rotulo="Custo dos produtos" valor={-d.custoProdutos} />
          {d.impostosTaxas > 0 && <Linha rotulo="Impostos e taxas" valor={-d.impostosTaxas} />}
          <div className="border-t border-border my-1.5" />
          <div className={`flex justify-between font-semibold ${positivo ? "text-positive" : "text-negative"}`}>
            <span>Lucro ({pct(d.margem)})</span>
            <span className="font-mono">{formatBRL(d.lucro)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-text-secondary">
      <span>{rotulo}</span>
      <span className="font-mono">{valor < 0 ? `− ${formatBRL(-valor)}` : formatBRL(valor)}</span>
    </div>
  );
}
