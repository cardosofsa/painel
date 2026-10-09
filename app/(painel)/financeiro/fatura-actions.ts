"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, pagarFaturaSchema } from "@/lib/validacao";

/**
 * Paga (toda ou parte da) fatura de um cartão com dinheiro de uma conta (0092). A regra mora no
 * banco (`pagar_fatura_cartao`): tira da conta, quita a dívida e libera o limite.
 */
export async function pagarFaturaCartao(dados: { cartao_id: string; conta_id: string; valor: number; data: string | null }) {
  return comResultado(async () => {
    const v = validar(pagarFaturaSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pagar_fatura_cartao", { p_cartao_id: v.cartao_id, p_conta_origem_id: v.conta_id, p_valor: v.valor, p_data: v.data });
    if (error?.code === "PGRST202") throw new Error("Pagar fatura precisa da migração 0092. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/financeiro");
    revalidatePath("/dashboard");
    revalidatePath("/configuracoes");
    const r = (data ?? {}) as { pago?: number; divida_restante?: number };
    return { pago: Number(r.pago ?? 0), dividaRestante: Number(r.divida_restante ?? 0) };
  });
}
