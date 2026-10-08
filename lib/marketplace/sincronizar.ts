import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FaixaComissao } from "@/lib/pricing";
import { montarPedidosParaGravar } from "./margem";
import { apiDaConexao } from "./conexao-api";
import { sincronizarRetornos } from "./sincronizar-retornos";
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
): Promise<{ pedidos: number; resultado: Record<string, number>; retornos: number }> {
  try {
    const api = await apiDaConexao(supabase, conexao);

    // Um dia de folga sobre a última sincronização (pedido que mudou de status perto da virada).
    const desde = conexao.ultima_sincronizacao ? new Date(new Date(conexao.ultima_sincronizacao).getTime() - 86_400_000) : new Date(Date.now() - 15 * 86_400_000);
    const reprocessar = apenas?.length ? [] : await pedidosParaReprocessar(supabase, conexao);
    const pedidos = await api.buscarPedidos(apenas?.length ? null : desde, apenas, reprocessar);

    let resultado: Record<string, number> = {};
    if (pedidos.length) {
      const [produtosRes, vinculosRes, perfilRes, faixas] = await Promise.all([
        supabase.from("produtos").select("id, sku, custo").eq("user_id", conexao.user_id),
        // user_id explícito: no cron o cliente é de serviço (sem RLS) e a trava é este filtro.
        supabase.from("marketplace_vinculos").select("sku_externo, produto_id").eq("user_id", conexao.user_id).eq("loja_id", conexao.loja_id),
        supabase.from("perfil_negocio").select("aliquota_das").eq("user_id", conexao.user_id).maybeSingle(),
        faixasDaLoja(supabase, conexao),
      ]);
      const produtos = (produtosRes.data ?? []).map((p) => ({ id: p.id as string, sku: p.sku as string | null, custo: Number(p.custo ?? 0) }));
      const gravar = montarPedidosParaGravar(pedidos, produtos, vinculosRes.data ?? [], Number(perfilRes.data?.aliquota_das ?? 0) / 100, faixas);
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
    // Devoluções (0090): passo à parte, que nunca derruba a sincronização dos pedidos.
    const { retornos } = apenas?.length ? { retornos: 0 } : await sincronizarRetornos(supabase, conexao, api, modo);
    return { pedidos: pedidos.length, resultado, retornos };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Erro desconhecido";
    await supabase.from("marketplace_conexoes").update({ ultimo_erro: msg }).eq("id", conexao.id);
    throw e;
  }
}

/** Quantos pedidos antigos cada sincronização reconsulta (de 5 em 5 escrows, cabe no cron). */
export const LIMITE_REPROCESSAR = 50;

/**
 * Pedidos dos últimos 30 dias que ainda pedem a API de novo: taxa estimada (a Shopee não
 * tinha a renda) ou repasse ainda não liberado. Sem a 0085 as colunas não existem: lista vazia.
 */
async function pedidosParaReprocessar(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<string[]> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("pedidos_marketplace")
    .select("numero")
    .eq("user_id", conexao.user_id)
    .eq("loja_id", conexao.loja_id)
    .not("status", "in", "(cancelado,nao_pago)")
    .gte("criado_em_plataforma", desde)
    .or("taxas_origem.is.null,taxas_origem.neq.real,escrow_liberado_em.is.null")
    .order("criado_em_plataforma", { ascending: false })
    .limit(LIMITE_REPROCESSAR);
  if (error) return [];
  return (data ?? []).map((p) => String(p.numero));
}

/** Faixas de comissão do canal da loja (estimativa enquanto a renda real não chega). */
async function faixasDaLoja(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<FaixaComissao[]> {
  const { data: loja } = await supabase.from("lojas_canal").select("canal_id").eq("user_id", conexao.user_id).eq("id", conexao.loja_id).maybeSingle();
  if (!loja?.canal_id) return [];
  const { data } = await supabase
    .from("faixas_comissao_canal")
    .select("preco_min, preco_max, comissao_pct, tarifa_fixa")
    .eq("user_id", conexao.user_id)
    .eq("canal_id", loja.canal_id)
    .order("ordem");
  return (data ?? []).map((f) => ({ min: Number(f.preco_min), max: f.preco_max == null ? null : Number(f.preco_max), comissaoPct: Number(f.comissao_pct), tarifaFixa: Number(f.tarifa_fixa ?? 0) }));
}
