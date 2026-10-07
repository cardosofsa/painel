import type { SupabaseClient } from "@supabase/supabase-js";
import { sincronizarConexao, type ConexaoShopee } from "./sincronizar";
import { credenciaisShopee } from "./shopee-api";
import { credenciaisML } from "./mercadolivre-api";
import { enviarEstoqueConexao } from "./estoque-servidor";

export interface ResumoSincronizacao {
  lojas: number;
  pedidos: number;
  novos: number;
  erros: string[];
}

/** "Sincronizar pedidos": todas as lojas conectadas à API da conta, uma por vez. Código de SERVIDOR. */
export async function sincronizarTodasAsLojas(supabase: SupabaseClient): Promise<ResumoSincronizacao> {
  if (!credenciaisShopee() && !credenciaisML()) throw new Error("Nenhuma API de marketplace está ligada neste servidor. Use Importar planilha ou configure em Canais de venda.");
  const { data, error } = await supabase.from("marketplace_conexoes").select("*");
  if (error) throw new Error("Nenhuma loja conectada (falta a migração 0046?).");
  const conexoes = (data ?? []) as ConexaoShopee[];
  if (!conexoes.length) throw new Error("Nenhuma loja conectada à API. Conecte em Configurações → Canais de venda.");
  let pedidos = 0;
  let novos = 0;
  const erros: string[] = [];
  for (const c of conexoes) {
    try {
      const r = await sincronizarConexao(supabase, c, "dono");
      pedidos += r.pedidos;
      novos += r.resultado.novos ?? 0;
      const e = await enviarEstoqueConexao(supabase, c).catch(() => ({ enviados: 0, erros: [] as string[] }));
      erros.push(...e.erros);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : "erro");
    }
  }
  return { lojas: conexoes.length, pedidos, novos, erros };
}
