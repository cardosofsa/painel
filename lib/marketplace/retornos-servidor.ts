import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmLotes } from "@/lib/lotes";
import { ordenarRetornos, retornoDeDevolucaoSistema, retornoDeLinhaShopee, type RetornoCentral } from "@/lib/retornos";

export interface DadosRetornos {
  /** false = a 0090 ainda não foi aplicada (a aba explica, sem erro). */
  disponivel: boolean;
  /** Última falha da sincronização de retornos de cada loja (ex.: app sem permissão de Devoluções). */
  erros: { loja: string; erro: string }[];
  lista: RetornoCentral[];
}

/**
 * Retornos dos últimos `dias`: os da Shopee (0090) e as devoluções do sistema (0059), numa lista só.
 * Nunca lança: cada parte que falhar (migração ausente, tabela sem permissão) vira vazio.
 * `lojas`: nome por id da loja.
 */
export async function carregarRetornos(supabase: SupabaseClient, dias: number, lojas: Map<string, string>): Promise<DadosRetornos> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const [shopeeRes, devolucoesRes, conexoesRes] = await Promise.all([
    buscarEmLotes((de, ate) =>
      supabase
        .from("retornos_marketplace")
        .select("*", { count: "exact" })
        .gte("criado_em_plataforma", desde)
        .order("criado_em_plataforma", { ascending: false })
        .order("id")
        .range(de, ate),
    { maximo: 5000 },
    ),
    supabase.from("devolucoes").select("id, numero, tipo, motivo, valor_estorno, forma, criado_em, vendas(numero, cliente_nome)").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(500),
    supabase.from("marketplace_conexoes").select("loja_id, ultimo_erro_retornos"),
  ]);

  const disponivel = !shopeeRes.error;
  const doSistema = devolucoesRes.error ? [] : ((devolucoesRes.data ?? []) as unknown as Record<string, unknown>[]).map(retornoDeDevolucaoSistema);
  const daShopee = disponivel ? ((shopeeRes.data ?? []) as Record<string, unknown>[]).map((l) => retornoDeLinhaShopee(l, lojas)) : [];
  const erros = conexoesRes.error
    ? []
    : ((conexoesRes.data ?? []) as { loja_id: string; ultimo_erro_retornos: string | null }[])
        .filter((c) => !!c.ultimo_erro_retornos)
        .map((c) => ({ loja: lojas.get(c.loja_id) ?? "Loja", erro: String(c.ultimo_erro_retornos) }));
  return { disponivel, erros, lista: ordenarRetornos([...daShopee, ...doSistema]) };
}
