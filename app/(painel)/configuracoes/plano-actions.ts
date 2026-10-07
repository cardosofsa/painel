"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { provedorCobranca } from "@/lib/cobranca";

/**
 * Configurações → Plano (10.9). Com provedor de cobrança ligado (Asaas), "Assinar" leva ao
 * checkout dele; sem provedor, registra o PEDIDO e o master ativa. Plano grátis com
 * provedor: encerra a assinatura paga no provedor, e o plano pago vale até o fim do período.
 */
export async function assinarPlano(planoId: string, voltaUrl: string, documento?: string | null) {
  return comResultado(async (): Promise<{ checkout: string | null; cancelada?: boolean }> => {
    const id = validar(z.string().regex(/^[a-z0-9_-]{2,30}$/), planoId);
    const doc = validar(z.string().max(30).nullish(), documento);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");

    const provedor = provedorCobranca();
    if (provedor) {
      const { data: plano } = await supabase.from("planos").select("id, nome, preco_mensal").eq("id", id).eq("ativo", true).maybeSingle();
      if (!plano) throw new Error("Plano indisponível.");
      const preco = Number(plano.preco_mensal);
      if (preco > 0) {
        const volta = validar(z.string().url().max(500), voltaUrl);
        const c = await provedor.criarCheckout({ userId: auth.user.id, email: auth.user.email ?? "", documento: doc, plano: { id: plano.id, nome: plano.nome, preco }, voltaUrl: volta });
        return { checkout: c.url };
      }
      // Grátis: quem paga pelo provedor encerra lá, mas o plano pago vale até o fim do período
      // já pago (a policy deixa a conta ler a própria linha). Marca ANTES de cancelar: o
      // "cancelada" que o provedor manda de volta não rebaixa a conta marcada.
      const { data: atual } = await supabase.from("assinaturas").select("provedor, provedor_ref, status, cancelamento_agendado").eq("user_id", auth.user.id).maybeSingle();
      if (atual?.provedor === provedor.id && atual.provedor_ref && atual.status !== "cancelada" && provedor.cancelarAssinatura) {
        if (!atual.cancelamento_agendado) {
          const { error: erroAgenda } = await supabase.rpc("agendar_cancelamento_assinatura", { p_agendar: true });
          if (erroAgenda) lancarErroSupabase(erroAgenda);
          try {
            await provedor.cancelarAssinatura(atual.provedor_ref);
          } catch (e) {
            // Continua cobrando no provedor: desfaz a marca para não ignorar o próximo cancelamento.
            await supabase.rpc("agendar_cancelamento_assinatura", { p_agendar: false });
            throw e;
          }
        }
        revalidatePath("/configuracoes");
        return { checkout: null, cancelada: true };
      }
    }

    const { error } = await supabase.rpc("solicitar_plano", { p_plano: id });
    if (error?.code === "PGRST202") throw new Error("Os planos precisam da migração 0057.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/admin");
    return { checkout: null };
  });
}
