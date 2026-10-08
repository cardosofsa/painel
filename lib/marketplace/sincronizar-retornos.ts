import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiMarketplace } from "./conexao-api";
import type { ConexaoShopee } from "./tokens";

/**
 * Sincroniza as devoluções de UMA loja (migração 0090). É um passo À PARTE dos pedidos: o app
 * Shopee pode não ter a permissão de Devoluções, ou a migração pode não estar aplicada, e nada
 * disso pode derrubar a sincronização de pedidos. Por isso NUNCA lança: o resultado (ou o erro)
 * vai para `marketplace_conexoes.ultimo_erro_retornos` e a tela de Retornos o mostra.
 */
export async function sincronizarRetornos(
  supabase: SupabaseClient,
  conexao: ConexaoShopee,
  api: ApiMarketplace,
  modo: "dono" | "servico",
): Promise<{ retornos: number; erro: string | null }> {
  if (!api.buscarRetornos) return { retornos: 0, erro: null };
  try {
    // Sem a 0090 não há onde gravar: nem chama a Shopee (a resposta se perderia a cada sincronização).
    const tabela = await supabase.from("retornos_marketplace").select("id").limit(1);
    if (tabela.error) throw new Error("Falta aplicar a migração 0090 (retornos) no Supabase.");
    // Um dia de folga sobre a última vez; primeira vez: 90 dias (o máximo que a busca olha).
    const desde = conexao.ultima_sincronizacao_retornos ? new Date(new Date(conexao.ultima_sincronizacao_retornos).getTime() - 86_400_000) : new Date(Date.now() - 90 * 86_400_000);
    const retornos = await api.buscarRetornos(desde);
    for (let i = 0; i < retornos.length; i += 500) {
      const lote = retornos.slice(i, i + 500);
      const { error } =
        modo === "servico"
          ? await supabase.rpc("importar_retornos_marketplace_servico", { p_user: conexao.user_id, p_loja_id: conexao.loja_id, p_retornos: lote })
          : await supabase.rpc("importar_retornos_marketplace", { p_loja_id: conexao.loja_id, p_retornos: lote });
      if (error) throw new Error(error.code === "PGRST202" ? "Falta aplicar a migração 0090 (retornos) no Supabase." : error.message);
    }
    await supabase.from("marketplace_conexoes").update({ ultima_sincronizacao_retornos: new Date().toISOString(), ultimo_erro_retornos: null }).eq("id", conexao.id);
    return { retornos: retornos.length, erro: null };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Erro desconhecido").slice(0, 300);
    await supabase.from("marketplace_conexoes").update({ ultimo_erro_retornos: msg }).eq("id", conexao.id);
    return { retornos: 0, erro: msg };
  }
}
