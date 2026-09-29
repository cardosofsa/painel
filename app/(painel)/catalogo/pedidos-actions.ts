"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { z } from "zod";

/**
 * Ações sobre o pedido que chegou da vitrine.
 *
 * Arquivo separado do `actions.ts` do catálogo porque são domínios diferentes: lá é
 * configuração de vitrine, aqui é atendimento de pedido. Junto, o `actions.ts` passaria de
 * 130 para mais de 250 linhas misturando as duas coisas.
 *
 * A escrita anônima acontece só na RPC `criar_pedido_vitrine` (migração 0027). Daqui para
 * a frente o pedido é dado normal do dono: RLS por `user_id` + `conta_ativa()`, como todo
 * o resto.
 */

const PATH = "/catalogo";

function revalidarTudo() {
  revalidatePath(PATH);
  // O contador na sidebar mora no layout do painel.
  revalidatePath("/", "layout");
}

const uuid = z.string().uuid("Identificador inválido");

const statusSchema = z.object({
  id: uuid,
  status: z.enum(["pendente", "aceito", "recusado"]),
});

export async function atualizarStatusPedido(id: string, status: "pendente" | "aceito" | "recusado") {
  return comResultado(async () => {
    const v = validar(statusSchema, { id, status });
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos_vitrine")
      .update({ status: v.status, atualizado_em: new Date().toISOString() })
      .eq("id", v.id)
      // Um pedido já convertido em venda não volta atrás por aqui: mexer no status dele
      // deixaria a venda órfã, apontada por um pedido que diz "recusado".
      .neq("status", "convertido");
    if (error) lancarErroSupabase(error);
    revalidarTudo();
  });
}

const itensSchema = z.object({
  pedidoId: uuid,
  itens: z
    .array(z.object({ id: uuid, quantidade: z.number().int().min(1).max(99) }))
    .min(1, "O pedido precisa ter pelo menos um item")
    .max(50),
});

/** Ajustar quantidade antes de fechar: o cliente pede 3 e você só tem 2. */
export async function ajustarItensPedido(pedidoId: string, itens: { id: string; quantidade: number }[]) {
  return comResultado(async () => {
    const v = validar(itensSchema, { pedidoId, itens });
    const supabase = await createClient();

    for (const item of v.itens) {
      const { error } = await supabase
        .from("pedidos_vitrine_itens")
        .update({ quantidade: item.quantidade })
        .eq("id", item.id)
        .eq("pedido_id", v.pedidoId);
      if (error) lancarErroSupabase(error);
    }

    // Recalcula o total a partir do que ficou gravado, não da soma que o cliente mandou.
    const { data: atuais, error: erroLer } = await supabase
      .from("pedidos_vitrine_itens")
      .select("quantidade, preco_unitario")
      .eq("pedido_id", v.pedidoId);
    if (erroLer) lancarErroSupabase(erroLer);

    const total = (atuais ?? []).reduce((acc, i) => acc + i.quantidade * Number(i.preco_unitario), 0);
    const { error: erroTotal } = await supabase
      .from("pedidos_vitrine")
      .update({ total, atualizado_em: new Date().toISOString() })
      .eq("id", v.pedidoId);
    if (erroTotal) lancarErroSupabase(erroTotal);

    revalidarTudo();
    return total;
  });
}

export async function removerItemPedido(itemId: string, pedidoId: string) {
  return comResultado(async () => {
    const v = validar(z.object({ itemId: uuid, pedidoId: uuid }), { itemId, pedidoId });
    const supabase = await createClient();
    const { error } = await supabase.from("pedidos_vitrine_itens").delete().eq("id", v.itemId);
    if (error) lancarErroSupabase(error);
    return await ajustarTotal(v.pedidoId);
  });
}

async function ajustarTotal(pedidoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos_vitrine_itens")
    .select("quantidade, preco_unitario")
    .eq("pedido_id", pedidoId);
  if (error) lancarErroSupabase(error);
  const total = (data ?? []).reduce((acc, i) => acc + i.quantidade * Number(i.preco_unitario), 0);
  const { error: erroTotal } = await supabase
    .from("pedidos_vitrine")
    .update({ total, atualizado_em: new Date().toISOString() })
    .eq("id", pedidoId);
  if (erroTotal) lancarErroSupabase(erroTotal);
  revalidarTudo();
  return total;
}

const converterSchema = z.object({
  pedidoId: uuid,
  status: z.enum(["paga", "fiado"]),
  cliente_id: uuid.nullable(),
  conta_id: uuid.nullable(),
  forma_pagamento: z.string().trim().max(200).nullable(),
  desconto: z.number().finite().min(0).max(10_000_000),
  valor_entrega: z.number().finite().min(0).max(10_000_000),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/**
 * Converte o pedido em venda.
 *
 * Reaproveita `registrar_venda` inteiro — o mesmo caminho do PDV. Isso importa por três
 * motivos: a conferência de estoque já está lá (e agrega por produto, então o mesmo SKU
 * repetido não escapa), o lançamento financeiro e o fiado também, e não nasce um segundo
 * jeito de registrar venda no sistema que amanhã divergiria do primeiro.
 *
 * O pedido **não** reservou estoque enquanto esteve pendente. Se o produto acabou nesse
 * meio tempo, quem barra é o `registrar_venda`, com a mensagem de sempre.
 */
export async function converterPedidoEmVenda(dados: z.input<typeof converterSchema>) {
  return comResultado(async () => {
    const v = validar(converterSchema, dados);
    const supabase = await createClient();

    const { data: itens, error: erroItens } = await supabase
      .from("pedidos_vitrine_itens")
      .select("produto_id, quantidade, preco_unitario")
      .eq("pedido_id", v.pedidoId);
    if (erroItens) lancarErroSupabase(erroItens);

    const vendaveis = (itens ?? []).filter((i) => i.produto_id);
    if (vendaveis.length === 0) {
      // Acontece quando todo produto do pedido foi apagado depois: a FK é `set null`
      // justamente para o pedido não sumir junto, mas aí não há o que vender.
      throw new Error("Nenhum produto deste pedido existe mais no seu cadastro.");
    }

    const { data: venda, error } = await supabase
      .rpc("registrar_venda", {
        p_itens: vendaveis.map((i) => ({
          produto_id: i.produto_id,
          quantidade: i.quantidade,
          preco_unitario: Number(i.preco_unitario),
        })),
        p_status: v.status,
        p_cliente_id: v.cliente_id,
        p_conta_id: v.conta_id,
        p_forma_pagamento: v.forma_pagamento,
        p_desconto: v.desconto,
        p_valor_entrega: v.valor_entrega,
        p_observacao: `Pedido da vitrine`,
        p_data_vencimento: v.data_vencimento,
      })
      .maybeSingle<{ venda_id: string; venda_numero: string; venda_total: number; venda_lucro: number }>();
    if (error) lancarErroSupabase(error);
    if (!venda) throw new Error("Erro ao registrar a venda.");

    const { error: erroMarcar } = await supabase
      .from("pedidos_vitrine")
      .update({ status: "convertido", venda_id: venda.venda_id, atualizado_em: new Date().toISOString() })
      .eq("id", v.pedidoId);
    if (erroMarcar) lancarErroSupabase(erroMarcar);

    revalidarTudo();
    revalidatePath("/vendas");
    revalidatePath("/estoque");
    revalidatePath("/financeiro");
    revalidatePath("/dashboard");
    return venda;
  });
}

/** Apagar em lote é o que torna o teto de pedidos pendentes suportável se alguém abusar. */
export async function removerPedidos(ids: string[]) {
  return comResultado(async () => {
    const v = validar(z.object({ ids: z.array(uuid).min(1).max(200) }), { ids });
    const supabase = await createClient();
    const { error } = await supabase.from("pedidos_vitrine").delete().in("id", v.ids);
    if (error) lancarErroSupabase(error);
    revalidarTudo();
  });
}
