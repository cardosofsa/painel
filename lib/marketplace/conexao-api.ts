import type { SupabaseClient } from "@supabase/supabase-js";
import type { PedidoMarketplace } from "./shopee-planilha";
import { buscarAnuncios, buscarPedidos, enviarEstoque, type AnuncioShopee } from "./shopee-api";
import { buscarAnunciosML, buscarPedidosML, enviarEstoqueML } from "./mercadolivre-api";
import { buscarRetornos, type RetornoMarketplace } from "./shopee-retornos";
import { tokenDaConexao, tokenML, type ConexaoShopee } from "./tokens";

/**
 * O que a sincronização e o estoque pedem de uma loja conectada, igual para todas as
 * plataformas (10.8). Shopee e Mercado Livre devolvem pedidos e anúncios no MESMO formato.
 */
export interface ApiMarketplace {
  plataforma: "shopee" | "mercadolivre";
  /**
   * `desde` null + `apenas`: só esses pedidos (notificação). `reprocessar`: pedidos já gravados
   * que a plataforma deve reconsultar (taxa real ainda não veio, repasse não liberado).
   */
  buscarPedidos(desde: Date | null, apenas?: string[], reprocessar?: string[]): Promise<PedidoMarketplace[]>;
  buscarAnuncios(): Promise<AnuncioShopee[]>;
  enviarEstoque(itemId: number, estoques: { modelId: number; quantidade: number }[]): Promise<void>;
  /** Devoluções atualizadas desde `desde` (0090). Só a Shopee tem; no Mercado Livre fica ausente. */
  buscarRetornos?(desde: Date): Promise<RetornoMarketplace[]>;
}

export const plataformaDa = (c: Pick<ConexaoShopee, "plataforma">) => (c.plataforma === "mercadolivre" ? "mercadolivre" : "shopee");

export async function apiDaConexao(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<ApiMarketplace> {
  if (plataformaDa(conexao) === "mercadolivre") {
    const { token, sellerId } = await tokenML(supabase, conexao);
    return {
      plataforma: "mercadolivre",
      buscarPedidos: (desde, apenas) => buscarPedidosML(token, sellerId, desde ?? new Date(Date.now() - 86_400_000), apenas),
      buscarAnuncios: () => buscarAnunciosML(token, sellerId),
      enviarEstoque: (itemId, estoques) => enviarEstoqueML(token, itemId, estoques),
    };
  }
  const { c, token, shopId } = await tokenDaConexao(supabase, conexao);
  return {
    plataforma: "shopee",
    // A Shopee não tem "só este pedido" na listagem: relê a janela normal.
    buscarPedidos: (desde, _apenas, reprocessar) => buscarPedidos(c, token, shopId, desde ?? new Date(Date.now() - 86_400_000), reprocessar),
    buscarAnuncios: () => buscarAnuncios(c, token, shopId),
    enviarEstoque: (itemId, estoques) => enviarEstoque(c, token, shopId, itemId, estoques),
    buscarRetornos: (desde) => buscarRetornos(c, token, shopId, desde),
  };
}
