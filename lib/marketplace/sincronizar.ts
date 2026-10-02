import type { SupabaseClient } from "@supabase/supabase-js";
import { montarPedidosParaGravar } from "./margem";
import { apiDaConexao } from "./conexao-api";
import type { ConexaoShopee } from "./tokens";

export { aadToken, aadTokenML, tokenDaConexao, tokenML, type ConexaoShopee } from "./tokens";

/**
 * Sincroniza UMA loja conectada à API da Shopee: renova o token se preciso, busca os
 * pedidos atualizados desde a última vez e passa pela MESMA importação da planilha.
 * Código de SERVIDOR. Serve ao botão "Sincronizar agora" (sessão do dono) e ao cron
 * (service key, com `userId` explícito e a RPC `_servico`).
 */

export async function sincronizarConexao(
  supabase: SupabaseClient,
  conexao: ConexaoShopee,
  modo: "dono" | "servico",
  /** Só estes pedidos (notificação do Mercado Livre); sem isso, tudo desde a última vez. */
  apenas?: string[],
): Promise<{ pedidos: number; resultado: Record<string, number> }> {
  try {
    const api = await apiDaConexao(supabase, conexao);

    // Um dia de folga sobre a última sincronização (pedido que mudou de status perto da virada).
    const desde = conexao.ultima_sincronizacao ? new Date(new Date(conexao.ultima_sincronizacao).getTime() - 86_400_000) : new Date(Date.now() - 15 * 86_400_000);
    const pedidos = await api.buscarPedidos(apenas?.length ? null : desde, apenas);

    let resultado: Record<string, number> = {};
    if (pedidos.length) {
      const [produtosRes, vinculosRes, perfilRes] = await Promise.all([
        supabase.from("produtos").select("id, sku, custo").eq("user_id", conexao.user_id),
        supabase.from("marketplace_vinculos").select("sku_externo, produto_id").eq("loja_id", conexao.loja_id),
        supabase.from("perfil_negocio").select("aliquota_das").eq("user_id", conexao.user_id).maybeSingle(),
      ]);
      const produtos = (produtosRes.data ?? []).map((p) => ({ id: p.id as string, sku: p.sku as string | null, custo: Number(p.custo ?? 0) }));
      const gravar = montarPedidosParaGravar(pedidos, produtos, vinculosRes.data ?? [], Number(perfilRes.data?.aliquota_das ?? 0) / 100);
      for (let i = 0; i < gravar.length; i += 500) {
        const lote = gravar.slice(i, i + 500);
        const { data, error } =
          modo === "servico"
            ? await supabase.rpc("importar_pedidos_marketplace_servico", { p_user: conexao.user_id, p_loja_id: conexao.loja_id, p_pedidos: lote })
            : await supabase.rpc("importar_pedidos_marketplace", { p_loja_id: conexao.loja_id, p_pedidos: lote });
        if (error) throw new Error(error.message);
        for (const [k, v] of Object.entries((data ?? {}) as Record<string, unknown>)) if (typeof v === "number") resultado[k] = (resultado[k] ?? 0) + v;
        // Logística e prazo (0047); sem a migração a função não existe e é ignorada.
        const envios = lote.filter((p) => p.logistica || p.prazo_envio).map((p) => ({ numero: p.numero, logistica: p.logistica, prazo_envio: p.prazo_envio }));
        if (envios.length)
          await (modo === "servico"
            ? supabase.rpc("atualizar_envio_marketplace_servico", { p_user: conexao.user_id, p_loja_id: conexao.loja_id, p_envios: envios })
            : supabase.rpc("atualizar_envio_marketplace", { p_loja_id: conexao.loja_id, p_envios: envios }));
      }
    } else resultado = { novos: 0, atualizados: 0 };

    if (!apenas?.length) await supabase.from("marketplace_conexoes").update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null }).eq("id", conexao.id);
    return { pedidos: pedidos.length, resultado };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Erro desconhecido";
    await supabase.from("marketplace_conexoes").update({ ultimo_erro: msg }).eq("id", conexao.id);
    throw e;
  }
}
