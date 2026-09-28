"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, movimentacaoEstoqueSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

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
