import { linkComprovanteWhatsapp } from "@/lib/comprovante";
import { ANTERIOR, ROTULO_ETAPA, type EtapaVenda, type PedidoCentral } from "@/lib/pedidos-central";
import type { TabelaExport } from "@/lib/exportar";
import type { RowMenuAction } from "@/components/ui/RowMenu";
import type { Venda } from "@/app/(painel)/vendas/tipos-venda";

/** Link do WhatsApp com o comprovante da venda (para o cliente cadastrado, se houver). */
export function comprovanteLink(v: Venda, clientes: { id: string; whatsapp: string | null }[]): string {
  const cliente = v.cliente_id ? clientes.find((c) => c.id === v.cliente_id) : null;
  return linkComprovanteWhatsapp(
    {
      numero: v.numero,
      itens: v.venda_itens.map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, garantia_dias: i.garantia_dias })),
      subtotal: v.subtotal,
      desconto: v.desconto,
      valorEntrega: v.valor_entrega,
      total: v.total,
      formaPagamento: v.forma_pagamento,
      clienteNome: v.cliente_nome,
    },
    cliente?.whatsapp ?? null,
  );
}

/** O menu ⋮ de cada pedido da central, conforme a origem e a etapa. */
export function montarAcoesPedido(
  p: PedidoCentral,
  c: {
    venda: Venda | undefined;
    freteConectado: boolean;
    abrir: () => void;
    anotar: () => void;
    voltarParaImprimir: () => void;
    detalhe: (v: Venda) => void;
    etiqueta: () => void;
    whatsapp: (v: Venda) => void;
    imagem: (v: Venda) => void;
    voltarEtapa: (para: EtapaVenda) => void;
    devolver: (v: Venda) => void;
    editar: (v: Venda) => void;
    cancelar: (v: Venda) => void;
  },
): RowMenuAction[] {
  const anotar = { label: "Observação e tags…", onClick: c.anotar };
  if (p.origem === "marketplace")
    return [
      { label: "Ver detalhes", onClick: c.abrir },
      anotar,
      ...(p.etapa === "retirada" && p.envio?.impressa ? [{ label: "Voltar para Para Imprimir", onClick: c.voltarParaImprimir }] : []),
    ];
  if (p.chave.startsWith("catalogo:")) return [{ label: "Abrir pedido", onClick: c.abrir }];
  const v = c.venda;
  if (!v) return [];
  if (p.etapa === "cancelado") return [{ label: "Ver detalhes", onClick: () => c.detalhe(v) }];
  const voltar = ANTERIOR[p.etapa];
  return [
    { label: "Ver detalhes", onClick: () => c.detalhe(v) },
    anotar,
    { label: "Imprimir (PDF)", onClick: () => window.open(`/vendas/${v.id}/comprovante`, "_blank") },
    ...(c.freteConectado && ["reservar", "emitir", "enviar", "imprimir"].includes(p.etapa) ? [{ label: "Comprar etiqueta (Melhor Envio)…", onClick: c.etiqueta }] : []),
    { label: "Enviar comprovante", onClick: () => c.whatsapp(v) },
    { label: "Comprovante em imagem", onClick: () => c.imagem(v) },
    ...(voltar ? [{ label: `Voltar para ${ROTULO_ETAPA[voltar]}`, onClick: () => c.voltarEtapa(voltar) }] : []),
    { label: "Devolução / troca…", onClick: () => c.devolver(v) },
    { label: "Editar", onClick: () => c.editar(v) },
    { label: "Cancelar venda", onClick: () => c.cancelar(v), destructive: true },
  ];
}

/** Exportar a lista atual de pedidos. */
export function tabelaPedidos(linhas: PedidoCentral[], etapaRotulo: string, periodoRotulo: string): TabelaExport<PedidoCentral> {
  return {
    titulo: "Pedidos",
    subtitulo: `${etapaRotulo} · ${periodoRotulo}`,
    colunas: [
      { rotulo: "Pedido", valor: (p) => p.numero },
      { rotulo: "Data", largura: 18, valor: (p) => new Date(p.data).toLocaleString("pt-BR") },
      { rotulo: "Canal", valor: (p) => p.canal },
      { rotulo: "Loja", valor: (p) => p.loja ?? "" },
      { rotulo: "Cliente", largura: 22, valor: (p) => p.cliente ?? "" },
      { rotulo: "UF", valor: (p) => p.uf ?? "" },
      { rotulo: "Produtos", largura: 40, valor: (p) => p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join("; ") },
      { rotulo: "Etapa", valor: (p) => ROTULO_ETAPA[p.etapa] },
      { rotulo: "Logística", valor: (p) => p.logistica ?? "" },
      { rotulo: "Valor", tipo: "moeda", valor: (p) => p.total },
      { rotulo: "Taxas", tipo: "moeda", valor: (p) => p.taxas },
      { rotulo: "Custo", tipo: "moeda", valor: (p) => p.custo },
      { rotulo: "Lucro", tipo: "moeda", valor: (p) => p.lucro },
      { rotulo: "Margem", tipo: "percentual", valor: (p) => (p.total > 0 ? p.lucro / p.total : 0) },
    ],
    linhas,
  };
}
