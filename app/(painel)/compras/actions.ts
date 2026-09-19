"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ItemPedidoInput {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  custo_unitario: number;
}

export type FormaPagamento = string;

export interface PedidoCompraInput {
  fornecedor_id: string;
  armazem_id: string | null;
  nf: string | null;
  nf_arquivo_path: string | null;
  data_pedido: string;
  data_entrega_prevista: string | null;
  forma_pagamento: FormaPagamento;
  conta_id: string;
  parcelado: boolean;
  parcelas: number | null;
  data_primeiro_vencimento: string;
  itens: ItemPedidoInput[];
}

function revalidateTudo() {
  revalidatePath("/compras");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
}

function somarMeses(dataIso: string, meses: number) {
  const d = new Date(dataIso + "T00:00:00");
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export async function criarPedidoCompra(dados: PedidoCompraInput) {
  const supabase = await createClient();
  const valorTotal = dados.itens.reduce((acc, it) => acc + it.quantidade * it.custo_unitario, 0);

  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos_compra")
    .insert({
      fornecedor_id: dados.fornecedor_id,
      armazem_id: dados.armazem_id,
      nf: dados.nf,
      nf_arquivo_path: dados.nf_arquivo_path,
      valor_total: valorTotal,
      data_pedido: dados.data_pedido,
      data_entrega_prevista: dados.data_entrega_prevista,
      forma_pagamento: dados.forma_pagamento,
      parcelas: dados.parcelado ? dados.parcelas : null,
      status: "pendente",
    })
    .select("id, numero")
    .single();

  if (erroPedido || !pedido) throw new Error(erroPedido?.message ?? "Erro ao criar pedido");

  const itensParaInserir = dados.itens.map((it) => ({ ...it, pedido_compra_id: pedido.id }));
  const { error: erroItens } = await supabase.from("pedidos_compra_itens").insert(itensParaInserir);
  if (erroItens) throw new Error(erroItens.message);

  const parcelas = dados.parcelado ? Math.max(1, dados.parcelas ?? 1) : 1;
  const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
  const titulos = Array.from({ length: parcelas }, (_, i) => {
    const ultima = i === parcelas - 1;
    const valor = ultima ? Math.round((valorTotal - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela;
    return {
      tipo: "pagar" as const,
      descricao: parcelas > 1 ? `Pedido ${pedido.numero} — parcela ${i + 1}/${parcelas}` : `Pedido ${pedido.numero}`,
      valor,
      data_vencimento: somarMeses(dados.data_primeiro_vencimento, i),
      status: "pendente" as const,
      conta_id: dados.conta_id,
      referencia_pedido_compra_id: pedido.id,
    };
  });

  const { error: erroTitulos } = await supabase.from("contas_a_pagar_receber").insert(titulos);
  if (erroTitulos) throw new Error(erroTitulos.message);

  revalidateTudo();
}

export async function obterUrlNotaFiscal(caminho: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("notas-fiscais").createSignedUrl(caminho, 300);
  if (error || !data) throw new Error(error?.message ?? "Erro ao gerar link da nota fiscal");
  return data.signedUrl;
}

export async function marcarPedidoRecebido(pedidoId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_pedido_recebido", { p_pedido_id: pedidoId });
  if (error) throw new Error(error.message);
  revalidateTudo();
}
