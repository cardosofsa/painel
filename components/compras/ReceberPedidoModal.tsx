"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { faltaReceber, STATUS_COMPRA, type StatusCompra } from "@/lib/compras";
import { formatBRL } from "@/lib/format";
import { receberPedidoCompra } from "@/app/(painel)/compras/actions";
import type { Opcao, Pedido } from "@/app/(painel)/compras/ComprasClient";

/**
 * Recebimento de um pedido de compra: cada item vem com o que falta chegar; a pessoa ajusta
 * o que chegou de fato. O que ficar faltando deixa o pedido "Parcial" para receber depois.
 */
export function ReceberPedidoModal({ pedido, armazens, onClose }: { pedido: Pedido; armazens: Opcao[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [armazemId, setArmazemId] = useState(pedido.armazem_id ?? armazens[0]?.id ?? "");
  const [qtd, setQtd] = useState<Record<string, number>>(() => Object.fromEntries(pedido.itens.map((i) => [i.id ?? i.produto_nome, faltaReceber(i)])));

  const itensAbertos = pedido.itens.filter((i) => faltaReceber(i) > 0);
  const totalChegando = itensAbertos.reduce((s, i) => s + (qtd[i.id ?? i.produto_nome] ?? 0), 0);
  const totalFalta = itensAbertos.reduce((s, i) => s + faltaReceber(i), 0);

  function confirmar() {
    if (totalChegando <= 0) return toast.error("Informe o que chegou de pelo menos um item.");
    startTransition(async () => {
      const r = await executarComToast(
        receberPedidoCompra({
          pedidoId: pedido.id,
          armazemId: armazemId || null,
          itens: itensAbertos.filter((i) => i.id).map((i) => ({ item_id: i.id!, quantidade: qtd[i.id!] ?? 0 })),
          tudo: totalChegando === totalFalta,
        }),
        { erro: "Erro ao receber o pedido" },
      );
      if (r.ok) {
        toast.success(r.dado === "parcial" ? `Recebido em parte: o pedido ${pedido.numero} ficou Parcial.` : `Pedido ${pedido.numero} completado.`);
        onClose();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Receber pedido ${pedido.numero}`} width="max-w-xl">
      <p className="text-sm text-text-secondary mb-3">
        {pedido.fornecedor_nome} · situação atual: {STATUS_COMPRA[pedido.status as StatusCompra]?.rotulo ?? pedido.status}. Ajuste o que chegou de verdade; o resto fica para depois.
      </p>
      <FormField label="Entrar no armazém">
        <select className={inputClass} value={armazemId} onChange={(e) => setArmazemId(e.target.value)}>
          {armazens.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="border border-border rounded-md divide-y divide-border mb-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs text-text-tertiary">
          <span>Item</span>
          <span className="w-20 text-right">Falta</span>
          <span className="w-24 text-right">Chegou</span>
        </div>
        {itensAbertos.map((i) => {
          const chave = i.id ?? i.produto_nome;
          return (
            <div key={chave} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="text-text-primary truncate">{i.produto_nome}</div>
                <div className="text-xs text-text-tertiary">
                  {i.quantidade} pedidas × {formatBRL(i.custo_unitario)}
                  {(i.quantidade_recebida ?? 0) > 0 && ` · ${i.quantidade_recebida} já chegaram`}
                </div>
              </div>
              <span className="w-20 text-right font-mono text-text-secondary">{faltaReceber(i)}</span>
              <input
                type="number"
                min={0}
                max={faltaReceber(i)}
                aria-label={`Quantidade que chegou de ${i.produto_nome}`}
                className={`${campoBase} w-24 text-right`}
                value={qtd[chave] ?? 0}
                onChange={(e) => setQtd((q) => ({ ...q, [chave]: Math.min(faltaReceber(i), Math.max(0, Math.floor(Number(e.target.value) || 0))) }))}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-sm mb-4">
        <button type="button" className="text-accent hover:underline" onClick={() => setQtd(Object.fromEntries(itensAbertos.map((i) => [i.id ?? i.produto_nome, faltaReceber(i)])))}>
          Chegou tudo
        </button>
        <span className="text-text-secondary">
          Chegando {totalChegando} de {totalFalta} {totalChegando < totalFalta && totalChegando > 0 ? "· ficará Parcial" : ""}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={confirmar} loading={pending}>
          Confirmar recebimento
        </Button>
      </div>
    </Modal>
  );
}
