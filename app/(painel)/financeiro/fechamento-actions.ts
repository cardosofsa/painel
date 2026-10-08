"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, relatorioMesSchema } from "@/lib/validacao";
import { hojeIsoBrasil } from "@/lib/format";
import { atualizarFechamentos, montarContextoRelatorio } from "@/lib/fechamento-servidor";
import { gerarRelatorioIA } from "@/lib/ia/gerar";
import type { RelatorioMes } from "@/lib/ia/prompts-relatorio";

const SEM_MIGRACAO = "O histórico mensal precisa da migração 0088. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "PGRST204" || code === "42703";

async function usuarioDaSessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  return { supabase, userId: data.user.id };
}

/** Guarda a foto de hoje (saldo e projeção do mês) e fecha os meses que já passaram. O cron faz o mesmo todo dia. */
export async function atualizarHistoricoFinanceiro() {
  return comResultado(async () => {
    const { supabase, userId } = await usuarioDaSessao();
    try {
      await atualizarFechamentos(supabase, userId, hojeIsoBrasil());
    } catch (e) {
      if (e instanceof Error && /fechamentos_mensais/.test(e.message)) throw new Error(SEM_MIGRACAO);
      throw e;
    }
    revalidatePath("/financeiro");
  });
}

export interface RelatorioGerado {
  relatorio: RelatorioMes & { gerado_em: string };
  usadas: number;
  limite: number;
  doCache: boolean;
  provedorRotulo: string | null;
}

/**
 * Análise do mês com IA, guardada junto do fechamento. A ordem da cota (cache → cota →
 * chamada) é a de `executarEstruturado`; aqui só se monta o contexto, agregado no servidor.
 */
export async function gerarRelatorioMes(mes: string) {
  return comResultado(async (): Promise<RelatorioGerado> => {
    const v = validar(relatorioMesSchema, { mes });
    const { supabase, userId } = await usuarioDaSessao();
    const hoje = hojeIsoBrasil();

    try {
      await atualizarFechamentos(supabase, userId, hoje);
    } catch (e) {
      if (e instanceof Error && /fechamentos_mensais/.test(e.message)) throw new Error(SEM_MIGRACAO);
      throw e;
    }
    const { contexto } = await montarContextoRelatorio(supabase, userId, v.mes, hoje);
    const { relatorio, usadas, limite, doCache, provedorRotulo } = await gerarRelatorioIA(supabase, contexto);

    const comData = { ...relatorio, gerado_em: new Date().toISOString() };
    const { error } = await supabase.from("fechamentos_mensais").update({ relatorio: comData }).eq("user_id", userId).eq("mes", v.mes);
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    revalidatePath("/financeiro");
    return { relatorio: comData, usadas, limite, doCache, provedorRotulo };
  });
}
