"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL } from "@/lib/format";
import { GradeProdutos } from "./GradeProdutos";
import { Carrinho, calcularDesconto, calcularSubtotal, type EstadoCarrinho } from "./Carrinho";
import { CheckoutModal, type DadosCheckout } from "./CheckoutModal";
import { ReciboModal } from "./ReciboModal";
import { registrarVenda, type VendaInput } from "./actions";
import { useFilaOffline } from "./useFilaOffline";
import { ehErroDeRede } from "@/lib/pdv-offline";
import {
  rotuloProduto,
  type ClientePdv,
  type ContaPdv,
  type FormaPagamentoPdv,
  type ItemCarrinho,
  type ProdutoPdv,
} from "./tipos";
import type { DadosComprovante } from "@/lib/comprovante";

const CARRINHO_VAZIO: EstadoCarrinho = {
  itens: [],
  descontoTipo: "valor",
  descontoEntrada: 0,
  valorEntrega: 0,
  observacao: "",
};

export function PdvClient({
  produtos,
  clientes,
  formasPagamento,
  contas,
  freteConectado = false,
  creditoTroca = null,
  userId = null,
  operadorId = null,
}: {
  /** 11.8: turno atual (vai com a venda guardada sem internet). */
  operadorId?: string | null;
  /** Dono das vendas guardadas sem internet (11.4). */
  userId?: string | null;
  freteConectado?: boolean;
  /** Crédito de uma troca (11.3): entra como desconto em R$. */
  creditoTroca?: { numero: string; valor: number } | null;
  produtos: ProdutoPdv[];
  clientes: ClientePdv[];
  formasPagamento: FormaPagamentoPdv[];
  contas: ContaPdv[];
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const offline = useFilaOffline(userId, operadorId);
  // Estoque na tela já descontando o que foi vendido sem internet e ainda não subiu.
  const produtosNaTela = useMemo(
    () => (offline.reservado.size ? produtos.map((p) => ({ ...p, estoque: Math.max(0, p.estoque - (offline.reservado.get(p.id) ?? 0)) })) : produtos),
    [produtos, offline.reservado],
  );
  const [estado, setEstado] = useState<EstadoCarrinho>(() =>
    creditoTroca ? { ...CARRINHO_VAZIO, descontoEntrada: creditoTroca.valor, observacao: `Troca ${creditoTroca.numero} (crédito de R$ ${creditoTroca.valor.toFixed(2).replace(".", ",")})` } : CARRINHO_VAZIO,
  );
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [recibo, setRecibo] = useState<DadosComprovante | null>(null);
  const [whatsappRecibo, setWhatsappRecibo] = useState<string | null>(null);
  const [vendaIdRecibo, setVendaIdRecibo] = useState<string | null>(null);
  /**
   * Contador de venda, usado só como `key` do checkout. O `CheckoutModal` guarda cliente,
   * forma de pagamento e vencimento em estado próprio; sem remontar, a venda seguinte abria
   * com o cliente da anterior já selecionado — e, se aquele cliente tivesse fiado liberado,
   * o botão "Venda Fiado" vinha habilitado por engano.
   */
  const [vendaSeq, setVendaSeq] = useState(0);

  const subtotal = calcularSubtotal(estado.itens);
  const desconto = calcularDesconto(estado, subtotal);
  const total = subtotal - desconto + estado.valorEntrega;
  const totalItens = estado.itens.reduce((acc, i) => acc + i.quantidade, 0);

  function quantidadeNoCarrinho(produtoId: string) {
    return estado.itens.find((i) => i.produto_id === produtoId)?.quantidade ?? 0;
  }

  function atualizar(parcial: Partial<EstadoCarrinho>) {
    setEstado((prev) => ({ ...prev, ...parcial }));
  }

  function adicionar(produto: ProdutoPdv) {
    setEstado((prev) => {
      const existente = prev.itens.find((i) => i.produto_id === produto.id);

      // Bloquear aqui é o que o usuário pediu; a RPC valida de novo no banco,
      // porque o estoque pode ter mudado entre o carregamento da página e a venda.
      if (existente && existente.quantidade >= produto.estoque) {
        toast.error(`Estoque insuficiente de "${rotuloProduto(produto)}": só há ${produto.estoque}.`);
        return prev;
      }
      if (!existente && produto.estoque < 1) {
        toast.error(`"${rotuloProduto(produto)}" está sem estoque.`);
        return prev;
      }

      if (existente) {
        return {
          ...prev,
          itens: prev.itens.map((i) =>
            i.produto_id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i,
          ),
        };
      }

      const novo: ItemCarrinho = {
        produto_id: produto.id,
        nome: rotuloProduto(produto),
        sku: produto.sku,
        preco_unitario: produto.preco_venda,
        quantidade: 1,
        estoque_disponivel: produto.estoque,
        imagem_url: produto.imagem_url,
        garantia_dias: produto.garantia_dias,
      };
      return { ...prev, itens: [...prev.itens, novo] };
    });
  }

  function alterarQuantidade(produtoId: string, quantidade: number) {
    if (quantidade < 1) {
      removerItem(produtoId);
      return;
    }
    setEstado((prev) => ({
      ...prev,
      itens: prev.itens.map((i) =>
        i.produto_id === produtoId ? { ...i, quantidade: Math.min(quantidade, i.estoque_disponivel) } : i,
      ),
    }));
  }

  function alterarPreco(produtoId: string, preco: number) {
    setEstado((prev) => ({
      ...prev,
      itens: prev.itens.map((i) => (i.produto_id === produtoId ? { ...i, preco_unitario: Math.max(preco, 0) } : i)),
    }));
  }

  function alterarGarantia(produtoId: string, dias: number | null) {
    setEstado((prev) => ({
      ...prev,
      itens: prev.itens.map((i) => (i.produto_id === produtoId ? { ...i, garantia_dias: dias } : i)),
    }));
  }

  function removerItem(produtoId: string) {
    setEstado((prev) => ({ ...prev, itens: prev.itens.filter((i) => i.produto_id !== produtoId) }));
  }

  async function limpar() {
    const ok = await confirm({
      title: "Esvaziar carrinho?",
      message: "Todos os itens desta venda serão descartados.",
      confirmLabel: "Esvaziar",
    });
    if (!ok) return;
    setEstado(CARRINHO_VAZIO);
    setCarrinhoAberto(false);
  }

  function abrirCheckout() {
    if (estado.itens.length === 0) return;
    setCarrinhoAberto(false);
    setCheckoutAberto(true);
  }

  function confirmarVenda(dados: DadosCheckout) {
    const venda: VendaInput = {
      itens: estado.itens.map((i) => ({
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        garantia_dias: i.garantia_dias,
      })),
      status: dados.status,
      cliente_id: dados.cliente_id,
      conta_id: dados.conta_id,
      forma_pagamento: dados.forma_pagamento,
      desconto,
      valor_entrega: estado.valorEntrega,
      observacao: estado.observacao.trim() || null,
      data_vencimento: dados.data_vencimento,
      entrada_valor: dados.entrada_valor,
      entrada_forma: dados.entrada_forma,
      forma_pagamento_2: dados.forma_pagamento_2,
      parcelas_cartao: dados.parcelas_cartao,
      taxa_maquineta_pct: dados.taxa_maquineta_pct,
      parcelas_fiado: dados.parcelas_fiado,
      dias_entre_parcelas: dados.dias_entre_parcelas,
    };
    // Sem internet: guarda no aparelho e segue vendendo (sobe quando a conexão voltar).
    async function guardarOffline() {
      const ok = await offline.enfileirar(venda, {
        total: subtotal - desconto + estado.valorEntrega,
        itens: estado.itens.map((i) => ({ produto_id: i.produto_id, nome: i.nome, quantidade: i.quantidade })),
      });
      if (!ok) return void toast.error("Sem internet e não foi possível guardar a venda neste aparelho.");
      toast.success("Sem internet: venda guardada neste aparelho. Ela sobe sozinha quando a conexão voltar.");
      setEstado(CARRINHO_VAZIO);
      setCheckoutAberto(false);
      setVendaSeq((n) => n + 1);
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return void guardarOffline();

    startTransition(async () => {
      let r: Awaited<ReturnType<typeof registrarVenda>>;
      try {
        r = await registrarVenda(venda);
      } catch (e) {
        if (ehErroDeRede(e)) return void (await guardarOffline());
        console.error("[pdv] venda:", e);
        return void toast.error("Erro ao registrar a venda");
      }
      if (!r.ok) return void toast.error(r.erro);
      if (r.ok) {
        const venda = r.dado;
        const cliente = clientes.find((c) => c.id === dados.cliente_id) ?? null;
        // Rótulo pro comprovante local — a RPC compõe o rótulo completo em
        // `vendas.forma_pagamento`, mas não devolve na resposta; monta de novo aqui com a
        // mesma regra (ver 0030) só pra exibição imediata.
        const formaExibida =
          dados.entrada_valor > 0
            ? `${dados.entrada_forma} (entrada) + ${dados.forma_pagamento_2 ?? ""}`.trim()
            : dados.forma_pagamento;
        setRecibo({
          numero: venda.venda_numero,
          itens: estado.itens.map((i) => ({
            nome: i.nome,
            quantidade: i.quantidade,
            preco_unitario: i.preco_unitario,
            garantia_dias: i.garantia_dias,
          })),
          subtotal,
          desconto,
          valorEntrega: estado.valorEntrega,
          total: venda.venda_total,
          formaPagamento: formaExibida,
          clienteNome: cliente?.nome ?? null,
        });
        setWhatsappRecibo(cliente?.whatsapp ?? null);
        setVendaIdRecibo(venda.venda_id);

        toast.success(`${venda.venda_numero} registrada — lucro ${formatBRL(venda.venda_lucro)}`);
        setEstado(CARRINHO_VAZIO);
        setCheckoutAberto(false);
        setVendaSeq((n) => n + 1);
      }
    });
  }

  const carrinho = (
    <Carrinho
      estado={estado}
      onEstado={atualizar}
      onAlterarQuantidade={alterarQuantidade}
      onAlterarPreco={alterarPreco}
      onAlterarGarantia={alterarGarantia}
      onRemover={removerItem}
      onLimpar={limpar}
      onFinalizar={abrirCheckout}
      freteConectado={freteConectado}
    />
  );

  return (
    <>
      <PageHeader title="PDV" />
      {offline.barra}
      {creditoTroca && (
        <p className="mb-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
          Troca {creditoTroca.numero}: crédito de {formatBRL(creditoTroca.valor)} já entra como desconto desta venda. Adicione os produtos novos.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 pb-20 lg:pb-0">
        <GradeProdutos produtos={produtosNaTela} quantidadeNoCarrinho={quantidadeNoCarrinho} onAdicionar={adicionar} />

        {/* Desktop: carrinho sempre visível ao lado. */}
        <Card className="hidden lg:flex flex-col sticky top-4 h-[calc(100vh-8rem)]">{carrinho}</Card>
      </div>

      {/* Celular: barra fixa que abre o carrinho em tela cheia. */}
      {totalItens > 0 && (
        <button
          onClick={() => setCarrinhoAberto(true)}
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-accent text-accent-on font-medium flex items-center justify-center gap-2"
        >
          <ShoppingCart size={16} />
          {totalItens} {totalItens === 1 ? "item" : "itens"} = {formatBRL(total)}
        </button>
      )}

      <Modal open={carrinhoAberto} onClose={() => setCarrinhoAberto(false)} title="Carrinho" width="max-w-lg">
        {carrinho}
      </Modal>

      <CheckoutModal
        key={vendaSeq}
        aberto={checkoutAberto}
        onFechar={() => setCheckoutAberto(false)}
        total={total}
        clientes={clientes}
        formasPagamento={formasPagamento}
        contas={contas}
        salvando={pending}
        onVoltar={() => {
          setCheckoutAberto(false);
          setCarrinhoAberto(true);
        }}
        onConfirmar={confirmarVenda}
      />
      <ReciboModal
        recibo={recibo}
        vendaId={vendaIdRecibo}
        whatsappCliente={whatsappRecibo}
        onClose={() => setRecibo(null)}
        onNovaVenda={() => setRecibo(null)}
      />
      {ConfirmDialog}
    </>
  );
}
