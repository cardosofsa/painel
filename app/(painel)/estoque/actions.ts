"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, movimentacaoEstoqueSchema, entradaEstoqueComCustoSchema, movimentacaoArmazemSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

/** Kit (0058) não tem estoque próprio: a movimentação manual é nos componentes. */
async function recusarKit(supabase: Awaited<ReturnType<typeof createClient>>, produtoId: string) {
  const { data } = await supabase.from("produtos").select("*").eq("id", produtoId).maybeSingle();
  if (data?.e_kit) throw new Error("Este produto é um kit: o estoque vem dos itens da composição. Movimente os componentes.");
}

/** Só pra saída: entrada passou a exigir custo, ver `registrarEntradaComCusto` abaixo. */
export async function registrarMovimentacaoEstoque(dados: {
  produtoId: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  motivo: string;
}) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(movimentacaoEstoqueSchema, dados);
    await recusarKit(supabase, v.produtoId);

    const { error } = await supabase.rpc("registrar_movimentacao_estoque", {
      p_produto_id: v.produtoId,
      p_tipo: v.tipo,
      p_quantidade: v.quantidade,
      p_motivo: v.motivo,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/estoque");
    revalidatePath("/produtos");
    revalidatePath("/dashboard");
  });
}

/**
 * Entrada de estoque com custo médio ponderado (migração 0029). O cálculo mora todo na
 * RPC `registrar_entrada_com_custo` — aqui só valida e traduz o erro.
 */
export async function registrarEntradaComCusto(dados: {
  produtoId: string;
  quantidade: number;
  custoUnitario: number;
  motivo: string | null;
}) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(entradaEstoqueComCustoSchema, dados);
    await recusarKit(supabase, v.produtoId);

    const { error } = await supabase.rpc("registrar_entrada_com_custo", {
      p_produto_id: v.produtoId,
      p_quantidade: v.quantidade,
      p_custo_unitario: v.custoUnitario,
      p_motivo: v.motivo,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/estoque");
    revalidatePath("/produtos");
    revalidatePath("/dashboard");
    revalidatePath("/precificacao");
  });
}

/**
 * Movimentação com armazém (0041): entrada (com custo médio), saída ou transferência entre
 * armazéns. Tudo validado e aplicado no banco (`movimentar_estoque_armazem`,
 * `transferir_estoque`).
 */
export async function movimentarEstoqueArmazem(dados: {
  produtoId: string;
  armazemId: string;
  tipo: "entrada" | "saida" | "transferencia";
  quantidade: number;
  custoUnitario: number | null;
  destinoId: string | null;
  motivo: string | null;
}) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(movimentacaoArmazemSchema, dados);
    await recusarKit(supabase, v.produtoId);
    const { error } =
      v.tipo === "transferencia"
        ? await supabase.rpc("transferir_estoque", {
            p_produto_id: v.produtoId,
            p_origem_id: v.armazemId,
            p_destino_id: v.destinoId,
            p_quantidade: v.quantidade,
            p_motivo: v.motivo,
          })
        : await supabase.rpc("movimentar_estoque_armazem", {
            p_produto_id: v.produtoId,
            p_armazem_id: v.armazemId,
            p_tipo: v.tipo,
            p_quantidade: v.quantidade,
            p_custo_unitario: v.custoUnitario,
            p_motivo: v.motivo,
          });
    if (error) lancarErroSupabase(error);

    revalidatePath("/estoque");
    revalidatePath("/produtos");
    revalidatePath("/dashboard");
    if (v.tipo === "entrada") revalidatePath("/precificacao");
  });
}
