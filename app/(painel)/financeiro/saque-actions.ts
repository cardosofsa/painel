"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, saqueMarketplaceSchema } from "@/lib/validacao";

export interface ResultadoSaque {
  baixados: number;
  valorBaixado: number;
  /** O que o saque trouxe a mais (+) ou a menos (−) que os repasses baixados: taxa, arredondamento. */
  diferenca: number;
}

/**
 * "Registrei um saque": credita o valor na conta e baixa os repasses liberados da loja, do
 * mais antigo ao mais novo (0089). A regra mora no banco (`registrar_saque_marketplace`).
 */
export async function registrarSaqueMarketplace(dados: { loja_id: string; valor: number; conta_id: string; data: string | null }) {
  return comResultado(async (): Promise<ResultadoSaque> => {
    const v = validar(saqueMarketplaceSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("registrar_saque_marketplace", { p_loja_id: v.loja_id, p_valor: v.valor, p_conta_id: v.conta_id, p_data: v.data });
    if (error?.code === "PGRST202") throw new Error("O registro de saque precisa da migração 0089. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/financeiro");
    revalidatePath("/dashboard");
    const r = (data ?? {}) as { baixados?: number; valor_baixado?: number; diferenca?: number };
    return { baixados: Number(r.baixados ?? 0), valorBaixado: Number(r.valor_baixado ?? 0), diferenca: Number(r.diferenca ?? 0) };
  });
}
