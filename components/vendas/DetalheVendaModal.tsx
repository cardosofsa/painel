"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { formatBRL } from "@/lib/format";
import { decomporVenda } from "@/lib/vendas-painel";
import type { Venda } from "@/app/(painel)/vendas/VendasClient";

const ROTULO_STATUS: Record<Venda["status"], { label: string; tone: "positive" | "negative" | "neutral" }> = {
  paga: { label: "Paga", tone: "positive" },
  fiado: { label: "Crediário", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "negative" },
};

/** Detalhe da venda: itens, conta do total ao lucro e as ações de comprovante/edição. */
export function DetalheVendaModal({
  venda,
  onClose,
  onWhatsapp,
  onImagem,
  onEditar,
  onCancelar,
  cancelando,
}: {
  venda: Venda;
  onClose: () => void;
  onWhatsapp: () => void;
  onImagem: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  cancelando: boolean;
}) {
  const d = decomporVenda(venda);
  const st = ROTULO_STATUS[venda.status];
  return (
    <Modal open onClose={onClose} title={`Venda ${venda.numero}`} width="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-text-secondary">
          {new Date(venda.data_venda).toLocaleString("pt-BR")}
          {venda.cliente_nome ? ` · ${venda.cliente_nome}` : ""}
        </div>
        <StatusChip label={st.label} tone={st.tone} />
      </div>

      <div className="divide-y divide-border border-y border-border mb-4">
        {venda.venda_itens.map((item, i) => (
          <div key={`${item.produto_sku ?? item.produto_nome}-${i}`} className="py-2.5 flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="text-text-primary">{item.produto_nome}</div>
              <div className="text-xs text-text-tertiary font-mono">
                {item.quantidade} × {formatBRL(item.preco_unitario)}
              </div>
            </div>
            <div className="font-mono text-text-primary shrink-0">{formatBRL(item.preco_unitario * item.quantidade)}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-text-secondary">
          <span>Subtotal</span>
          <span className="font-mono">{formatBRL(venda.subtotal)}</span>
        </div>
        {venda.desconto > 0 && (
          <div className="flex justify-between text-negative">
            <span>Desconto</span>
            <span className="font-mono">− {formatBRL(venda.desconto)}</span>
          </div>
        )}
        {d.entrega > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Entrega</span>
            <span className="font-mono">+ {formatBRL(d.entrega)}</span>
          </div>
        )}
        {d.devolvido > 0 && (
          <div className="flex justify-between text-negative">
            <span>Devolvido</span>
            <span className="font-mono">− {formatBRL(d.devolvido)}</span>
          </div>
        )}
        <div className="flex justify-between text-text-primary font-semibold pt-1">
          <span>Total</span>
          <span className="font-mono">{formatBRL(venda.total)}</span>
        </div>
        <div className="flex justify-between text-text-secondary pt-2 border-t border-border mt-2">
          <span>Custo da mercadoria</span>
          <span className="font-mono">− {formatBRL(d.custoProdutos)}</span>
        </div>
        {d.impostosTaxas > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Impostos e taxas</span>
            <span className="font-mono">− {formatBRL(d.impostosTaxas)}</span>
          </div>
        )}
        {d.fretePago > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Frete pago</span>
            <span className="font-mono">− {formatBRL(d.fretePago)}</span>
          </div>
        )}
        <div className={`flex justify-between font-medium ${d.lucro >= 0 ? "text-positive" : "text-negative"}`}>
          <span>Lucro ({(d.margem * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span>
          <span className="font-mono">{formatBRL(d.lucro)}</span>
        </div>
      </div>

      {venda.observacao && <p className="text-sm text-text-secondary mt-4 pt-3 border-t border-border whitespace-pre-wrap">{venda.observacao}</p>}

      {venda.status !== "cancelada" && (
        <div className="flex flex-col gap-2 mt-5">
          <Button variant="secondary" className="w-full" onClick={onWhatsapp}>
            <MessageCircle size={14} />
            Enviar comprovante
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onImagem}>
              Imagem
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => window.open(`/vendas/${venda.id}/comprovante`, "_blank")}>
              PDF
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onEditar}>
              Editar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={onCancelar} loading={cancelando}>
              Cancelar venda
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
