"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { provedorCobranca } from "@/lib/cobranca";

/**
 * Configurações → Plano (10.9). Com provedor de cobrança ligado, "Assinar" leva ao
 * checkout dele; sem provedor (hoje), registra o PEDIDO e o master ativa.
 */
export async function assinarPlano(planoId: string, voltaUrl: string) {
  return comResultado(async (): Promise<{ checkout: string | null }> => {
    const id = validar(z.string().regex(/^[a-z0-9_-]{2,30}$/), planoId);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");

    const provedor = provedorCobranca();
    if (provedor) {
      const { data: plano } = await supabase.from("planos").select("id, nome, preco_mensal").eq("id", id).eq("ativo", true).maybeSingle();
      if (!plano) throw new Error("Plano indisponível.");
      const volta = validar(z.string().url().max(500), voltaUrl);
      const c = await provedor.criarCheckout({ userId: auth.user.id, email: auth.user.email ?? "", plano: { id: plano.id, nome: plano.nome, preco: Number(plano.preco_mensal) }, voltaUrl: volta });
      return { checkout: c.url };
    }

    const { error } = await supabase.rpc("solicitar_plano", { p_plano: id });
    if (error?.code === "PGRST202") throw new Error("Os planos precisam da migração 0057.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/admin");
    return { checkout: null };
  });
}
