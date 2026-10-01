import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, decifrar } from "@/lib/ia/cofre";
import { buscarPedidos, credenciaisShopee, renovarToken } from "./shopee-api";
import { montarPedidosParaGravar } from "./margem";

/**
 * Sincroniza UMA loja conectada à API da Shopee: renova o token se preciso, busca os
 * pedidos atualizados desde a última vez e passa pela MESMA importação da planilha.
 * Código de SERVIDOR. Serve ao botão "Sincronizar agora" (sessão do dono) e ao cron
 * (service key, com `userId` explícito e a RPC `_servico`).
 */

export interface ConexaoShopee {
  id: string;
  user_id: string;
  loja_id: string;
  shop_id: string;
  access_token_cifrado: string | null;
  refresh_token_cifrado: string | null;
  expira_em: string | null;
  ultima_sincronizacao: string | null;
}

/** AAD do cofre: o token de uma loja não decifra na linha de outra. */
export const aadToken = (userId: string, lojaId: string) => `${userId}:shopee:${lojaId}`;

export async function sincronizarConexao(
  supabase: SupabaseClient,
  conexao: ConexaoShopee,
  modo: "dono" | "servico",
): Promise<{ pedidos: number; resultado: Record<string, number> }> {
  const c = credenciaisShopee();
  if (!c) throw new Error("A integração com a Shopee não está ligada neste sistema (faltam SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY).");
  if (!conexao.access_token_cifrado || !conexao.refresh_token_cifrado) throw new Error("Loja sem autorização. Conecte de novo.");

  const aad = aadToken(conexao.user_id, conexao.loja_id);
  const shopId = Number(conexao.shop_id);
  let token = decifrar(conexao.access_token_cifrado, aad);

  try {
    if (!conexao.expira_em || new Date(conexao.expira_em).getTime() < Date.now()) {
      const novos = await renovarToken(c, decifrar(conexao.refresh_token_cifrado, aad), shopId);
      token = novos.accessToken;
      await supabase
        .from("marketplace_conexoes")
        .update({ access_token_cifrado: cifrar(novos.accessToken, aad), refresh_token_cifrado: cifrar(novos.refreshToken, aad), expira_em: novos.expiraEm })
        .eq("id", conexao.id);
    }

    // Um dia de folga sobre a última sincronização (pedido que mudou de status perto da virada).
    const desde = conexao.ultima_sincronizacao ? new Date(new Date(conexao.ultima_sincronizacao).getTime() - 86_400_000) : new Date(Date.now() - 15 * 86_400_000);
    const pedidos = await buscarPedidos(c, token, shopId, desde);

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

    await supabase.from("marketplace_conexoes").update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null }).eq("id", conexao.id);
    return { pedidos: pedidos.length, resultado };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Erro desconhecido";
    await supabase.from("marketplace_conexoes").update({ ultimo_erro: msg }).eq("id", conexao.id);
    throw e;
  }
}
