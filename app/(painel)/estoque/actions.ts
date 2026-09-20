"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";

export async function registrarMovimentacaoEstoque(dados: {
  produtoId: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  motivo: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("registrar_movimentacao_estoque", {
    p_produto_id: dados.produtoId,
    p_tipo: dados.tipo,
    p_quantidade: dados.quantidade,
    p_motivo: dados.motivo,
  });
  if (error) lancarErroSupabase(error);

  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/dashboard");
}
