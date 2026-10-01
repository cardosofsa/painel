"use client";

import { toast } from "sonner";
import { useMemo, useState, useTransition } from "react";
import { Inbox, MessageCircle, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { StatusChip } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { CheckoutModal } from "@/app/(painel)/pdv/CheckoutModal";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";
import {
  atualizarStatusPedido,
  converterPedidoEmVenda,
  removerItemPedido,
  removerPedidos,
} from "@/app/(painel)/catalogo/pedidos-actions";

export interface ItemPedidoVitrine {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
}

export interface PedidoVitrine {
  id: string;
  numero: string;
  catalogo_nome: string | null;
  cliente_nome: string;
  cliente_whatsapp: string;
  /** Opcionais: o comprador pode não ter informado. Sempre exibidos como TEXTO. */
  cliente_email: string | null;
  /** Cadastro ligado automaticamente na chegada do pedido (0043). */
  cliente_id?: string | null;
  entrega: string | null;
  observacao: string | null;
  total: number;
  status: "pendente" | "aceito" | "recusado" | "convertido";
  criado_em: string;
  venda_id: string | null;
  itens: ItemPedidoVitrine[];
}

const FILTROS = [
  { id: "pendente", label: "Pendentes" },
  { id: "aceito", label: "Aceitos" },
  { id: "convertido", label: "Convertidos" },
  { id: "recusado", label: "Recusados" },
  { id: "todos", label: "Todos" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

const TOM: Record<PedidoVitrine["status"], "positive" | "negative" | "neutral"> = {
  pendente: "neutral",
  aceito: "positive",
  convertido: "positive",
  recusado: "negative",
};

const ROTULO: Record<PedidoVitrine["status"], string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  convertido: "Virou venda",
  recusado: "Recusado",
};

function linkCliente(whatsapp: string, numero: string) {
  const digitos = whatsapp.replace(/\D/g, "");
  const com55 = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${com55}?text=${encodeURIComponent(`Olá! Sobre o seu pedido ${numero}:`)}`;
}

export function PedidosVitrine({
  pedidos,
  clientes,
  contas,
  formasPagamento,
  pedidoInicial = null,
}: {
  /** Número (P-0001) vindo do link do WhatsApp: abre esse pedido direto. */
  pedidoInicial?: string | null;
  pedidos: PedidoVitrine[];
  clientes: ClientePdv[];
  contas: ContaPdv[];
  formasPagamento: FormaPagamentoPdv[];
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [filtro, setFiltro] = useState<Filtro>("pendente");
  const [aberto, setAberto] = useState<PedidoVitrine | null>(() => (pedidoInicial ? (pedidos.find((p) => p.numero === pedidoInicial) ?? null) : null));
  const [checkout, setCheckout] = useState<PedidoVitrine | null>(null);
  const [salvando, setSalvando] = useState(false);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: pedidos.length };
    for (const p of pedidos) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pedidos]);

  const lista = useMemo(
    () => (filtro === "todos" ? pedidos : pedidos.filter((p) => p.status === filtro)),
    [pedidos, filtro],
  );

  function mudarStatus(p: PedidoVitrine, status: "aceito" | "recusado") {
    startTransition(async () => {
      const r = await executarComToast(atualizarStatusPedido(p.id, status), {
        sucesso: status === "aceito" ? `Pedido ${p.numero} aceito` : `Pedido ${p.numero} recusado`,
        erro: "Erro ao atualizar o pedido",
      });
      if (r.ok) setAberto(null);
    });
  }

  async function apagar(p: PedidoVitrine) {
    const ok = await confirm({
      title: "Apagar este pedido?",
      message: `O pedido ${p.numero} de ${p.cliente_nome} será removido definitivamente.`,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerPedidos([p.id]), {
        sucesso: "Pedido removido",
        erro: "Erro ao remover o pedido",
      });
      if (r.ok) setAberto(null);
    });
  }

  async function apagarTratados() {
    const ids = pedidos.filter((p) => p.status === "recusado").map((p) => p.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: "Limpar recusados?",
      message: `${ids.length} pedido(s) recusado(s) serão removidos definitivamente.`,
      confirmLabel: "Limpar",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerPedidos(ids), { sucesso: "Pedidos removidos", erro: "Erro ao remover" });
    });
  }

  function removerItem(item: ItemPedidoVitrine, pedido: PedidoVitrine) {
    if (pedido.itens.length <= 1) return;
    startTransition(async () => {
      await executarComToast(removerItemPedido(item.id, pedido.id), {
        sucesso: "Item removido",
        erro: "Erro ao remover o item",
      });
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <ChipRow>
          {FILTROS.map((f) => (
            <Chip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.label} <span className="text-text-tertiary">({contagem[f.id] ?? 0})</span>
            </Chip>
          ))}
        </ChipRow>
        {(contagem.recusado ?? 0) > 0 && (
          <Button variant="secondary" size="sm" onClick={apagarTratados}>
            <Trash2 size={14} />
            Limpar recusados
          </Button>
        )}
      </div>

      {lista.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={filtro === "pendente" ? "Nenhum pedido aguardando" : "Nada por aqui"}
            description="Os pedidos que os clientes enviarem pela vitrine aparecem nesta lista."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-text-primary">{p.numero}</span>
                    <StatusChip label={ROTULO[p.status]} tone={TOM[p.status]} />
                    <span className="text-xs text-text-tertiary">{formatarDataHora(p.criado_em)}</span>
                  </div>
                  <div className="text-sm text-text-primary">{p.cliente_nome}</div>
                  <div className="text-xs text-text-tertiary">
                    {p.itens.length} item(ns) · {p.catalogo_nome ?? "catálogo removido"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-base font-semibold text-text-primary">{formatBRL(p.total)}</span>
                  <Button variant="secondary" size="sm" onClick={() => setAberto(p)}>
                    Abrir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        key={aberto?.id ?? "fechado"}
        open={!!aberto}
        onClose={() => setAberto(null)}
        title={aberto ? `Pedido ${aberto.numero}` : ""}
        width="max-w-lg"
      >
        {aberto && (
          <div>
            {/*
              O nome e a observação foram digitados por um desconhecido na internet. Dizer
              isso na tela é o que impede o golpe do "PIX pendente, confirme em tal link"
              parecer um aviso do próprio sistema. Nada aqui vira link clicável.
            */}
            <div className="text-xs text-text-tertiary border border-border rounded-md px-3 py-2 mb-4">
              Enviado pelo cliente pela vitrine. Confira os dados antes de fechar a venda.
            </div>

            <div className="space-y-1 mb-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">Cliente</span>
                <span className="text-text-primary text-right">{aberto.cliente_nome}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">WhatsApp</span>
                <a
                  href={linkCliente(aberto.cliente_whatsapp, aberto.numero)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline font-mono"
                >
                  {aberto.cliente_whatsapp}
                </a>
              </div>
              {aberto.cliente_email && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary">E-mail</span>
                  <span className="text-text-primary text-right break-all">{aberto.cliente_email}</span>
                </div>
              )}
              {aberto.entrega && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-secondary shrink-0">Entrega</span>
                  <span className="text-text-primary text-right break-words">{aberto.entrega}</span>
                </div>
              )}
              {aberto.observacao && (
                <div className="pt-2">
                  <div className="text-text-secondary mb-1">Observação</div>
                  <p className="text-text-primary whitespace-pre-wrap break-words bg-surface-2 rounded-md p-2.5">
                    {aberto.observacao}
                  </p>
                </div>
              )}
            </div>

            <div className="border border-border rounded-md divide-y divide-border mb-4">
              {aberto.itens.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary truncate">
                      {i.quantidade}x {i.produto_nome}
                    </div>
                    {!i.produto_id && (
                      <div className="text-xs text-negative">Este produto não existe mais no cadastro</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm text-text-primary">
                      {formatBRL(i.preco_unitario * i.quantidade)}
                    </span>
                    {aberto.status !== "convertido" && aberto.itens.length > 1 && (
                      <IconButton onClick={() => removerItem(i, aberto)} aria-label={`Remover ${i.produto_nome}`}>
                        <Trash2 size={14} className="text-negative" />
                      </IconButton>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-text-secondary">Total</span>
                <span className="font-mono text-base font-semibold text-text-primary">{formatBRL(aberto.total)}</span>
              </div>
            </div>

            {aberto.status === "convertido" ? (
              <p className="text-sm text-text-secondary text-center py-2">Este pedido já virou venda: está na lista de vendas abaixo.</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={linkCliente(aberto.cliente_whatsapp, aberto.numero)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    <MessageCircle size={14} />
                    Responder
                  </Button>
                </a>
                {aberto.status !== "recusado" && (
                  <Button variant="destructive" className="flex-1" onClick={() => mudarStatus(aberto, "recusado")}>
                    Recusar
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    setCheckout(aberto);
                    setAberto(null);
                  }}
                >
                  Fechar venda
                </Button>
              </div>
            )}

            <button
              onClick={() => apagar(aberto)}
              className="w-full text-xs text-text-tertiary hover:text-negative mt-4 py-1"
            >
              Apagar este pedido
            </button>
          </div>
        )}
      </Modal>

      {/*
        O mesmo CheckoutModal do PDV: forma de pagamento, conta que recebe, fiado e
        vencimento já estão resolvidos ali. Um fluxo paralelo divergiria com o tempo.
      */}
      <CheckoutModal
        key={checkout?.id ?? "checkout-fechado"}
        aberto={!!checkout}
        onFechar={() => setCheckout(null)}
        onVoltar={() => {
          setAberto(checkout);
          setCheckout(null);
        }}
        total={checkout?.total ?? 0}
        clientes={clientes}
        formasPagamento={formasPagamento}
        contas={contas}
        salvando={salvando}
        onConfirmar={(dados) => {
          if (!checkout) return;
          setSalvando(true);
          startTransition(async () => {
            const r = await executarComToast(
              converterPedidoEmVenda({
                pedidoId: checkout.id,
                status: dados.status,
                cliente_id: dados.cliente_id,
                conta_id: dados.conta_id,
                forma_pagamento: dados.forma_pagamento,
                desconto: 0,
                valor_entrega: 0,
                data_vencimento: dados.data_vencimento,
                entrada_valor: dados.entrada_valor,
                entrada_forma: dados.entrada_forma,
                forma_pagamento_2: dados.forma_pagamento_2,
                parcelas_cartao: dados.parcelas_cartao,
                taxa_maquineta_pct: dados.taxa_maquineta_pct,
                parcelas_fiado: dados.parcelas_fiado,
                dias_entre_parcelas: dados.dias_entre_parcelas,
              }),
              { erro: "Erro ao fechar a venda" },
            );
            setSalvando(false);
            if (r.ok) {
              setCheckout(null);
              toast.success(`Venda ${r.dado.venda_numero} registrada: foi para Em separação.`);
              if (r.dado.cliente_criado) {
                toast.success("Comprador cadastrado em Clientes (inativo)");
              }
            }
          });
        }}
      />

      {ConfirmDialog}
    </>
  );
}
