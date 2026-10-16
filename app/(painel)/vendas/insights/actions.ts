"use server";

import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { validar, iaConsultorSchema } from "@/lib/validacao";
import { carregarDadosInsights } from "@/lib/consultor/carregar";
import { analisarPorDias } from "@/lib/consultor/insights";
import { gerarConsultorIA } from "@/lib/ia/gerar";
import { montarContextoConsultor, type NarracaoConsultor } from "@/lib/ia/prompts-consultor";

export interface NarracaoGerada {
  narracao: NarracaoConsultor;
  usadas: number;
  limite: number;
  doCache: boolean;
  provedorRotulo: string | null;
}

/**
 * Narração por IA dos Insights. O cliente manda só o período e a loja: os números são
 * recalculados aqui, no servidor, a partir do banco (RLS), então a IA nunca narra valor que
 * veio do navegador. A ordem cache → cota → chamada é a de `executarEstruturado`.
 */
export async function gerarNarracaoInsights(entrada: unknown) {
  return comResultado(async (): Promise<NarracaoGerada> => {
    const { dias, loja_id } = validar(iaConsultorSchema, entrada);
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sua sessão expirou. Entre de novo para continuar.");

    const dados = await carregarDadosInsights(supabase);
    if (!dados.disponivel) throw new Error("Os pedidos da Shopee ainda não estão disponíveis. Sincronize em Vendas.");
    const contexto = montarContextoConsultor(analisarPorDias(dados, dias, new Date(), loja_id));
    if (contexto.anuncios.length === 0) throw new Error("Ainda não há anúncios com vendas suficientes neste período para a IA analisar.");

    const { narracao, usadas, limite, doCache, provedorRotulo } = await gerarConsultorIA(supabase, contexto);
    return { narracao, usadas, limite, doCache, provedorRotulo };
  });
}
