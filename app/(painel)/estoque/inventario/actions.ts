"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, inventarioSchema, type InventarioInput } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

/** Aplica a contagem (0074): o banco compara com o saldo atual e lança as diferenças. */
export async function aplicarInventario(dados: InventarioInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(inventarioSchema, dados);
    const { data, error } = await supabase.rpc("aplicar_inventario", {
      p_armazem_id: v.armazemId,
      p_itens: v.itens,
      p_observacao: v.observacao ?? null,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/estoque");
    revalidatePath("/estoque/inventario");
    revalidatePath("/produtos");
    revalidatePath("/dashboard");
    return data as string;
  });
}
