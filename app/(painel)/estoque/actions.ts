"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, movimentacaoEstoqueSchema, entradaEstoqueComCustoSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

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
