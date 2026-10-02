"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { CheckoutModal } from "@/app/(painel)/pdv/CheckoutModal";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";
import { atualizarStatusPedido, converterPedidoEmVenda, removerItemPedido, removerPedidos } from "@/app/(painel)/catalogo/pedidos-actions";
import type { ItemPedidoVitrine, PedidoVitrine } from "@/lib/pedidos-vitrine-tipos";

function linkCliente(whatsapp: string, numero: string) {
  const digitos = whatsapp.replace(/\D/g, "");
  const com55 = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${com55}?text=${encodeURIComponent(`Olá! Sobre o seu pedido ${numero}:`)}`;
}

/**
 * Pedido do catálogo em "Para Emitir": conferir, responder, recusar ou APROVAR. Aprovar abre
 * o mesmo fechamento do PDV (forma de pagamento, conta, fiado) e a venda segue para Imprimir.
 */
export function PedidoCatalogoModal({
  pedido,
  onClose,
  clientes,
  contas,
  formasPagamento,
}: {
  pedido: PedidoVitrine;
  onClose: () => void;
  clientes: ClientePdv[];
  contas: ContaPdv[];
  formasPagamento: FormaPagamentoPdv[];
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [checkout, setCheckout] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function recusar() {
    startTransition(async () => {
      const r = await executarComToast(atualizarStatusPedido(pedido.id, "recusado"), { sucesso: `Pedido ${pedido.numero} recusado`, erro: "Erro ao atualizar o pedido" });
      if (r.ok) onClose();
    });
  }

  async function apagar() {
    const ok = await confirm({ title: "Apagar este pedido?", message: `O pedido ${pedido.numero} de ${pedido.cliente_nome} será removido definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerPedidos([pedido.id]), { sucesso: "Pedido removido", erro: "Erro ao remover o pedido" });
      if (r.ok) onClose();
    });
  }

  function removerItem(item: ItemPedidoVitrine) {
    if (pedido.itens.length <= 1) return;
    startTransition(async () => {
      await executarComToast(removerItemPedido(item.id, pedido.id), { sucesso: "Item removido", erro: "Erro ao remover o item" });
    });
  }

  return (
    <>
      <Modal open={!checkout} onClose={onClose} title={`Pedido ${pedido.numero} · catálogo`} width="max-w-lg">
        {/* Nome e observação foram digitados por um desconhecido: nada aqui vira link. */}
        <div className="text-xs text-text-tertiary border border-border rounded-md px-3 py-2 mb-4">Enviado pelo cliente pela vitrine. Confira os dados antes de aprovar.</div>
        <div className="space-y-1 mb-4 text-sm">
          <Linha rotulo="Cliente" valor={pedido.cliente_nome} />
          <div className="flex justify-between gap-3">
            <span className="text-text-secondary">WhatsApp</span>
            <a href={linkCliente(pedido.cliente_whatsapp, pedido.numero)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono">
              {pedido.cliente_whatsapp}
            </a>
          </div>
          {pedido.cliente_email && <Linha rotulo="E-mail" valor={pedido.cliente_email} />}
          {pedido.forma_pagamento && <Linha rotulo="Pagamento escolhido" valor={pedido.forma_pagamento} />}
          {pedido.entrega && <Linha rotulo="Entrega" valor={pedido.entrega} />}
          {pedido.frete && (
            <Linha
              rotulo="Frete escolhido"
              valor={`${pedido.frete.servico}${pedido.frete.prazoDias ? ` · ${pedido.frete.prazoDias} dia(s)` : ""} · ${pedido.frete.valor ? formatBRL(pedido.frete.valor) : "grátis"}`}
            />
          )}
          {pedido.observacao && (
            <div className="pt-2">
              <div className="text-text-secondary mb-1">Observação</div>
              <p className="text-text-primary whitespace-pre-wrap break-words bg-surface-2 rounded-md p-2.5">{pedido.observacao}</p>
            </div>
          )}
        </div>
        <div className="border border-border rounded-md divide-y divide-border mb-4">
          {pedido.itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">
                  {i.quantidade}x {i.produto_nome}
                </div>
                {!i.produto_id && <div className="text-xs text-negative">Este produto não existe mais no cadastro</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-sm text-text-primary">{formatBRL(i.preco_unitario * i.quantidade)}</span>
                {pedido.itens.length > 1 && (
                  <IconButton onClick={() => removerItem(i)} aria-label={`Remover ${i.produto_nome}`}>
                    <Trash2 size={14} className="text-negative" />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm text-text-secondary">Total</span>
            <span className="font-mono text-base font-semibold text-text-primary">{formatBRL(pedido.total)}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a href={linkCliente(pedido.cliente_whatsapp, pedido.numero)} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="secondary" className="w-full">
              <MessageCircle size={14} /> Responder
            </Button>
          </a>
          <Button variant="destructive" className="flex-1" onClick={recusar}>
            Recusar
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => setCheckout(true)}>
            Aprovar
          </Button>
        </div>
        <button onClick={apagar} className="w-full text-xs text-text-tertiary hover:text-negative mt-4 py-1">
          Apagar este pedido
        </button>
      </Modal>

      {/* O mesmo CheckoutModal do PDV: um fluxo paralelo divergiria com o tempo. */}
      <CheckoutModal
        aberto={checkout}
        onFechar={onClose}
        onVoltar={() => setCheckout(false)}
        total={pedido.total}
        clientes={clientes}
        formasPagamento={formasPagamento}
        contas={contas}
        salvando={salvando}
        formaInicial={pedido.forma_pagamento ?? null}
        onConfirmar={(dados) => {
          setSalvando(true);
          startTransition(async () => {
            const r = await executarComToast(
              converterPedidoEmVenda({
                pedidoId: pedido.id,
                status: dados.status,
                cliente_id: dados.cliente_id,
                conta_id: dados.conta_id,
                forma_pagamento: dados.forma_pagamento,
                desconto: 0,
                valor_entrega: pedido.frete?.valor ?? 0,
                data_vencimento: dados.data_vencimento,
                entrada_valor: dados.entrada_valor,
                entrada_forma: dados.entrada_forma,
                forma_pagamento_2: dados.forma_pagamento_2,
                parcelas_cartao: dados.parcelas_cartao,
                taxa_maquineta_pct: dados.taxa_maquineta_pct,
                parcelas_fiado: dados.parcelas_fiado,
                dias_entre_parcelas: dados.dias_entre_parcelas,
              }),
              { erro: "Erro ao aprovar o pedido" },
            );
            setSalvando(false);
            if (r.ok) {
              toast.success(`Pedido aprovado: venda ${r.dado.venda_numero} foi para Para Imprimir.`);
              if (r.dado.cliente_criado) toast.success("Comprador cadastrado em Clientes (inativo)");
              onClose();
            }
          });
        }}
      />
      {ConfirmDialog}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-secondary shrink-0">{rotulo}</span>
      <span className="text-text-primary text-right break-words">{valor}</span>
    </div>
  );
}
