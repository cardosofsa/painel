"use server";

import { revalidatePath } from "next/cache";
import { hojeIsoLocal, dataLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, pedidoCompraSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { z } from "zod";

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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Grava um pedido (cabeçalho, itens e parcelas a pagar). Usado pelo formulário e pela
 * importação. `frete`/`observacao` (0042) só vão quando preenchidos: antes da migração as
 * colunas não existem, e mandá-las vazias derrubaria o cadastro.
 */
async function gravarPedido(supabase: Supabase, v: PedidoCompraInput, extra: { frete?: number; observacao?: string | null } = {}) {
  const frete = Math.max(0, extra.frete ?? 0);
  const valorTotal = v.itens.reduce((acc, it) => acc + it.quantidade * it.custo_unitario, 0) + frete;

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
      ...(frete > 0 ? { frete } : {}),
      ...(extra.observacao ? { observacao: extra.observacao.slice(0, 500) } : {}),
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
  return pedido;
}

export async function criarPedidoCompra(dados: PedidoCompraInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    // O schema impõe o teto de 48 parcelas. Sem ele, um `parcelas: 1e8` vindo do cliente
    // fazia o `Array.from({ length })` alocar a lista inteira e derrubar o processo Node.
    const v = validar(pedidoCompraSchema, dados);
    await gravarPedido(supabase, v);
    revalidateTudo();
  });
}

export interface PedidoImportadoInput {
  fornecedor_id: string;
  frete: number;
  observacao: string | null;
  itens: ItemPedidoInput[];
}

/**
 * Importação de pedidos de compra (planilha). A tela já validou e mostrou a prévia; aqui
 * cada pedido passa de novo pelo mesmo schema do formulário antes de gravar.
 */
export async function importarPedidosCompra(
  pedidos: PedidoImportadoInput[],
  comum: { armazem_id: string | null; conta_id: string; forma_pagamento: string; data_primeiro_vencimento: string },
) {
  return comResultado(async () => {
    if (pedidos.length === 0) throw new Error("Nenhum pedido para importar.");
    if (pedidos.length > 200) throw new Error("Importe no máximo 200 pedidos por vez.");
    const supabase = await createClient();
    const hoje = hojeIsoLocal();
    const criados: string[] = [];
    for (const p of pedidos) {
      const v = validar(pedidoCompraSchema, {
        fornecedor_id: p.fornecedor_id,
        armazem_id: comum.armazem_id,
        nf: null,
        nf_arquivo_path: null,
        data_pedido: hoje,
        data_entrega_prevista: null,
        forma_pagamento: comum.forma_pagamento,
        conta_id: comum.conta_id,
        parcelado: false,
        parcelas: null,
        data_primeiro_vencimento: comum.data_primeiro_vencimento,
        itens: p.itens,
      });
      const pedido = await gravarPedido(supabase, v, { frete: p.frete, observacao: p.observacao });
      criados.push(pedido.numero);
    }
    revalidateTudo();
    return { criados };
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

const idSchema = z.string().uuid("Pedido inválido");
const recebimentoSchema = z.object({
  pedidoId: idSchema,
  armazemId: z.string().uuid().nullable(),
  itens: z.array(z.object({ item_id: z.string().uuid(), quantidade: z.number().int().min(0).max(1_000_000) })).max(500),
});

/**
 * Recebe o que chegou (0042): tudo ou parte de cada item, no armazém escolhido. O banco
 * decide se o pedido fica Parcial ou Completado e devolve o status.
 */
export async function receberPedidoCompra(dados: { pedidoId: string; armazemId: string | null; itens: { item_id: string; quantidade: number }[]; tudo: boolean }) {
  return comResultado(async () => {
    const v = validar(recebimentoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("receber_pedido_compra", {
      p_pedido_id: v.pedidoId,
      p_itens: v.itens.filter((i) => i.quantidade > 0),
      p_armazem_id: v.armazemId,
    });
    // Sem a 0042 a RPC nova não existe: recebendo tudo, a antiga resolve; parcial não dá.
    if (error?.code === "PGRST202") {
      if (!dados.tudo) throw new Error("Receber só parte do pedido precisa da migração 0042 aplicada. Por enquanto, receba o pedido inteiro.");
      const antigo = await supabase.rpc("marcar_pedido_recebido", { p_pedido_id: v.pedidoId });
      if (antigo.error) lancarErroSupabase(antigo.error);
      revalidateTudo();
      return "recebido";
    }
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    return (data as string | null) ?? "recebido";
  });
}

export async function cancelarPedidoCompra(pedidoId: string) {
  return comResultado(async () => {
    const id = validar(idSchema, pedidoId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancelar_pedido_compra", { p_pedido_id: id });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    return (data as number | null) ?? 0;
  });
}

/** Para comprar ↔ Em trânsito. Só entre esses dois: o resto muda por receber/cancelar. */
export async function definirTransitoPedido(pedidoId: string, emTransito: boolean) {
  return comResultado(async () => {
    const id = validar(idSchema, pedidoId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pedidos_compra")
      .update({ status: emTransito ? "em_transito" : "pendente" })
      .eq("id", id)
      .in("status", emTransito ? ["pendente"] : ["em_transito"])
      .select("id");
    if (error) lancarErroSupabase(error);
    if (!data?.length) throw new Error("Este pedido já mudou de situação. Atualize a página.");
    revalidateTudo();
  });
}
