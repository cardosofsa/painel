"use client";

import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { faltaReceber, STATUS_COMPRA, type StatusCompra } from "@/lib/compras";
import type { Pedido } from "@/app/(painel)/compras/ComprasClient";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-text-tertiary">{rotulo}</div>
      <div className="text-text-primary">{children}</div>
    </div>
  );
}

/** Detalhe do pedido de compra: dados, itens com o que já chegou e o total. */
export function DetalhePedidoModal({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const st = STATUS_COMPRA[pedido.status as StatusCompra] ?? { rotulo: pedido.status, tom: "neutral" as const };
  return (
    <Modal open onClose={onClose} title={`Pedido ${pedido.numero}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Campo rotulo="Fornecedor">{pedido.fornecedor_nome}</Campo>
          <Campo rotulo="Destino">{pedido.armazem_nome ?? "—"}</Campo>
          <Campo rotulo="Data do pedido">
            <span className="font-mono">{formatarDataIso(pedido.data_pedido)}</span>
          </Campo>
          <Campo rotulo="Entrega prevista">
            <span className="font-mono">{pedido.data_entrega_prevista ? formatarDataIso(pedido.data_entrega_prevista) : "—"}</span>
          </Campo>
          <Campo rotulo="Chegada">
            <span className="font-mono">{pedido.data_recebimento ? formatarDataIso(pedido.data_recebimento) : "Ainda não chegou tudo"}</span>
          </Campo>
          <Campo rotulo="Situação">
            <StatusChip label={st.rotulo} tone={st.tom} />
          </Campo>
          <Campo rotulo="Forma de pagamento">
            {pedido.forma_pagamento ?? "—"}
            {pedido.parcelas && pedido.parcelas > 1 ? ` em ${pedido.parcelas}x` : ""}
          </Campo>
          <Campo rotulo="Conta">{pedido.conta_nome ?? "—"}</Campo>
          {pedido.nf && <Campo rotulo="Nota fiscal">{pedido.nf}</Campo>}
          {pedido.observacao && <Campo rotulo="Observação">{pedido.observacao}</Campo>}
        </div>

        <div>
          <div className="text-xs text-text-tertiary mb-2">Itens do pedido</div>
          <div className="border border-border rounded-md divide-y divide-border">
            {pedido.itens.map((it, i) => {
              const falta = faltaReceber(it);
              return (
                <div key={it.id ?? i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-text-primary truncate">{it.produto_nome}</div>
                    {pedido.status !== "cancelado" && (it.quantidade_recebida ?? 0) > 0 && (
                      <div className="text-xs text-text-tertiary">{falta === 0 ? "Tudo recebido" : `${it.quantidade_recebida} recebidas · faltam ${falta}`}</div>
                    )}
                  </div>
                  <span className="font-mono text-text-secondary shrink-0">
                    {it.quantidade} × {formatBRL(it.custo_unitario)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {(pedido.frete ?? 0) > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Frete</span>
            <span className="font-mono">{formatBRL(pedido.frete ?? 0)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-sm text-text-secondary">Valor total</span>
          <span className="font-mono text-text-primary font-semibold">{formatBRL(pedido.valor_total)}</span>
        </div>
      </div>
    </Modal>
  );
}
