"use server";

import { revalidatePath } from "next/cache";
import { hojeIsoLocal, dataLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, pedidoCompraSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

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
  const d = dataLocal(dataIso);
  d.setMonth(d.getMonth() + meses);
  return hojeIsoLocal(d);
}

export async function criarPedidoCompra(dados: PedidoCompraInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    // O schema impõe o teto de 48 parcelas. Sem ele, um `parcelas: 1e8` vindo do cliente
    // fazia o `Array.from({ length })` lá embaixo alocar a lista inteira e derrubar o
    // processo Node antes mesmo de encostar no banco.
    const v = validar(pedidoCompraSchema, dados);
    const valorTotal = v.itens.reduce((acc, it) => acc + it.quantidade * it.custo_unitario, 0);

    const { data: pedido, error: erroPedido } = await supabase
      .from("pedidos_compra")
      .insert({
        fornecedor_id: v.fornecedor_id,
        armazem_id: v.armazem_id,
        nf: v.nf,
        nf_arquivo_path: v.nf_arquivo_path,
        valor_total: valorTotal,
        data_pedido: v.data_pedido,
        data_entrega_prevista: v.data_entrega_prevista,
        forma_pagamento: v.forma_pagamento,
        parcelas: v.parcelado ? v.parcelas : null,
        status: "pendente",
      })
      .select("id, numero")
      .single();

    if (erroPedido) lancarErroSupabase(erroPedido);
    if (!pedido) throw new Error("Erro ao criar pedido.");

    const itensParaInserir = v.itens.map((it) => ({ ...it, pedido_compra_id: pedido.id }));
    const { error: erroItens } = await supabase.from("pedidos_compra_itens").insert(itensParaInserir);
    if (erroItens) lancarErroSupabase(erroItens);

    const parcelas = v.parcelado ? Math.max(1, v.parcelas ?? 1) : 1;
    const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
    const titulos = Array.from({ length: parcelas }, (_, i) => {
      const ultima = i === parcelas - 1;
      const valor = ultima ? Math.round((valorTotal - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela;
      return {
        tipo: "pagar" as const,
        descricao: parcelas > 1 ? `Pedido ${pedido.numero} — parcela ${i + 1}/${parcelas}` : `Pedido ${pedido.numero}`,
        valor,
        data_vencimento: somarMeses(v.data_primeiro_vencimento, i),
        status: "pendente" as const,
        conta_id: v.conta_id,
        referencia_pedido_compra_id: pedido.id,
      };
    });

    const { error: erroTitulos } = await supabase.from("contas_a_pagar_receber").insert(titulos);
    if (erroTitulos) lancarErroSupabase(erroTitulos);

    revalidateTudo();
  });
}

export async function obterUrlNotaFiscal(caminho: string) {
  return comResultado(async () => {
    const supabase = await createClient();

    // Defesa em profundidade: hoje quem barra caminho alheio é só a policy
    // `notas_fiscais_select_own` do Storage, que compara a primeira pasta com o auth.uid().
    // Sem esta linha, relaxar aquela policy um dia viraria leitura de NF de outra conta —
    // e o parâmetro chega cru do navegador.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !caminho.startsWith(`${user.id}/`)) throw new Error("Nota fiscal não encontrada.");

    const { data, error } = await supabase.storage.from("notas-fiscais").createSignedUrl(caminho, 300);
    if (error) lancarErroSupabase(error);
    if (!data) throw new Error("Erro ao gerar link da nota fiscal.");
    return data.signedUrl;
  });
}

export async function marcarPedidoRecebido(pedidoId: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("marcar_pedido_recebido", { p_pedido_id: pedidoId });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}
