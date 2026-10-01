"use client";

import { useTransition } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { ROTULO_ETAPA, type PedidoCentral } from "@/lib/pedidos-central";
import type { PedidoMarketplaceSalvo } from "@/lib/marketplace/pedidos-servidor";
import { removerPedidoMarketplace } from "@/app/(painel)/vendas/marketplace-actions";

/** Detalhe de um pedido de marketplace: itens, taxas reais, repasse e lucro. Só leitura. */
export function DetalheMarketplaceModal({ p, bruto, onClose }: { p: PedidoCentral; bruto: PedidoMarketplaceSalvo | undefined; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  async function remover() {
    const ok = await confirm({
      title: `Remover o pedido ${p.numero}?`,
      message: "O estoque baixado por ele volta e o repasse pendente sai do Financeiro. Sincronizar ou importar de novo traz o pedido de volta.",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerPedidoMarketplace(p.id), { sucesso: `Pedido ${p.numero} removido`, erro: "Erro ao remover" });
      if (r.ok) onClose();
    });
  }

  const linhas: [string, number][] = bruto
    ? [
        ["Venda dos produtos", bruto.subtotal],
        ...(bruto.cupom_vendedor > 0 ? ([["Cupom do vendedor", -bruto.cupom_vendedor]] as [string, number][]) : []),
        ["Comissão", -bruto.comissao],
        ["Taxa de serviço", -bruto.taxa_servico],
        ...(bruto.taxa_transacao > 0 ? ([["Taxa de transação", -bruto.taxa_transacao]] as [string, number][]) : []),
      ]
    : [];

  return (
    <>
      <Modal open onClose={onClose} title={`Pedido ${p.numero}`} width="max-w-lg">
        <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
          <IconeMarca nome={p.canal} tamanho={18} /> {p.canal}
          {p.loja ? ` · ${p.loja}` : ""} · <span className="font-medium text-text-primary">{ROTULO_ETAPA[p.etapa]}</span>
        </div>
        <div className="text-sm space-y-1 mb-4">
          <div className="flex justify-between gap-3">
            <span className="text-text-secondary">Comprador</span>
            <span className="text-text-primary">{p.cliente ?? "—"}</span>
          </div>
          {(p.cidade || p.uf) && (
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Destino</span>
              <span className="text-text-primary">{[p.cidade, p.uf].filter(Boolean).join(", ")}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-text-secondary">Logística</span>
            <span className="text-text-primary inline-flex items-center gap-1">
              <Lock size={11} className="text-text-tertiary" /> {p.logistica ?? "Envio da plataforma"}
            </span>
          </div>
          {bruto?.rastreio && (
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Rastreio</span>
              <span className="text-text-primary font-mono">{bruto.rastreio}</span>
            </div>
          )}
        </div>
        <div className="border border-border rounded-md divide-y divide-border mb-4">
          {p.itens.map((i, n) => (
            <div key={n} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate text-text-primary">
                  {i.quantidade}× {i.nome}
                </div>
                {i.sku && <div className="text-[11px] font-mono text-text-tertiary">{i.sku}</div>}
              </div>
              <span className="font-mono text-text-primary shrink-0">{formatBRL(i.preco * i.quantidade)}</span>
            </div>
          ))}
        </div>
        {bruto && p.etapa !== "cancelado" && (
          <div className="text-sm space-y-1 mb-4">
            {linhas.map(([r, v]) => (
              <div key={r} className="flex justify-between text-text-secondary">
                <span>{r}</span>
                <span className="font-mono">{formatBRL(v)}</span>
              </div>
            ))}
            <div className="flex justify-between font-medium text-text-primary border-t border-border pt-1">
              <span>Repasse da Shopee</span>
              <span className="font-mono">{formatBRL(bruto.repasse)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Custo dos produtos</span>
              <span className="font-mono">{formatBRL(-bruto.custo)}</span>
            </div>
            {bruto.imposto > 0 && (
              <div className="flex justify-between text-text-secondary">
                <span>Imposto</span>
                <span className="font-mono">{formatBRL(-bruto.imposto)}</span>
              </div>
            )}
            <div className={`flex justify-between font-semibold border-t border-border pt-1 ${bruto.lucro >= 0 ? "text-positive" : "text-negative"}`}>
              <span>Lucro</span>
              <span className="font-mono">{formatBRL(bruto.lucro)}</span>
            </div>
          </div>
        )}
        <p className="text-xs text-text-tertiary mb-3">Status, envio e etiqueta são controlados na Shopee. Aqui o pedido atualiza a cada sincronização.</p>
        <Button variant="ghost" className="w-full" loading={pending} onClick={remover}>
          Remover este pedido do SERTÃO
        </Button>
      </Modal>
      {ConfirmDialog}
    </>
  );
}
