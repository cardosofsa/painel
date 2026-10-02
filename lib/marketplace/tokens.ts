import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, decifrar } from "@/lib/ia/cofre";
import { credenciaisShopee, renovarToken, type CredenciaisShopee } from "./shopee-api";
import { credenciaisML, renovarTokenML } from "./mercadolivre-api";

/**
 * Conexões com a API das plataformas (0046) e os tokens delas, cifrados no cofre. Código de
 * SERVIDOR. Shopee e Mercado Livre (10.8) usam a mesma tabela `marketplace_conexoes`.
 */

export interface ConexaoShopee {
  id: string;
  user_id: string;
  loja_id: string;
  /** 'shopee' (padrão) ou 'mercadolivre' (10.8). */
  plataforma?: string;
  shop_id: string;
  access_token_cifrado: string | null;
  refresh_token_cifrado: string | null;
  expira_em: string | null;
  ultima_sincronizacao: string | null;
  /** 0049: estoque do SERTÃO enviado sozinho para os anúncios desta loja. */
  estoque_auto?: boolean;
  /** 0049: quando o dono conferiu a prévia e ativou (sem isso, nada é enviado). */
  estoque_confirmado_em?: string | null;
  anuncios_atualizados_em?: string | null;
}

/** AAD do cofre: o token de uma loja não decifra na linha de outra. */
export const aadToken = (userId: string, lojaId: string) => `${userId}:shopee:${lojaId}`;

/** Credenciais, token válido (renova e regrava cifrado se venceu) e shop_id da conexão. */
export async function tokenDaConexao(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<{ c: CredenciaisShopee; token: string; shopId: number }> {
  const c = credenciaisShopee();
  if (!c) throw new Error("A integração com a Shopee não está ligada neste sistema (faltam SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY).");
  if (!conexao.access_token_cifrado || !conexao.refresh_token_cifrado) throw new Error("Loja sem autorização. Conecte de novo.");
  const aad = aadToken(conexao.user_id, conexao.loja_id);
  const shopId = Number(conexao.shop_id);
  let token = decifrar(conexao.access_token_cifrado, aad);
  if (!conexao.expira_em || new Date(conexao.expira_em).getTime() < Date.now()) {
    const novos = await renovarToken(c, decifrar(conexao.refresh_token_cifrado, aad), shopId);
    token = novos.accessToken;
    const cifrados = { access_token_cifrado: cifrar(novos.accessToken, aad), refresh_token_cifrado: cifrar(novos.refreshToken, aad), expira_em: novos.expiraEm };
    await supabase.from("marketplace_conexoes").update(cifrados).eq("id", conexao.id);
    Object.assign(conexao, cifrados);
  }
  return { c, token, shopId };
}

/** AAD do Mercado Livre (o da Shopee segue `aadToken`, por compatibilidade). */
export const aadTokenML = (userId: string, lojaId: string) => `${userId}:mercadolivre:${lojaId}`;

/**
 * Token válido do Mercado Livre: renova quando vence e GRAVA o novo refresh_token (no ML ele
 * é de uso único — perder o novo derruba a conexão).
 */
export async function tokenML(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<{ token: string; sellerId: string }> {
  const c = credenciaisML();
  if (!c) throw new Error("A integração com o Mercado Livre não está ligada neste sistema (faltam ML_CLIENT_ID e ML_CLIENT_SECRET).");
  if (!conexao.access_token_cifrado || !conexao.refresh_token_cifrado) throw new Error("Conta do Mercado Livre sem autorização. Conecte de novo.");
  const aad = aadTokenML(conexao.user_id, conexao.loja_id);
  let token = decifrar(conexao.access_token_cifrado, aad);
  if (!conexao.expira_em || new Date(conexao.expira_em).getTime() < Date.now()) {
    const novos = await renovarTokenML(c, decifrar(conexao.refresh_token_cifrado, aad));
    token = novos.accessToken;
    const cifrados = { access_token_cifrado: cifrar(novos.accessToken, aad), refresh_token_cifrado: cifrar(novos.refreshToken, aad), expira_em: novos.expiraEm };
    const { error } = await supabase.from("marketplace_conexoes").update(cifrados).eq("id", conexao.id);
    if (error) throw new Error(`Não foi possível guardar o token renovado do Mercado Livre: ${error.message}`);
    Object.assign(conexao, cifrados);
  }
  return { token, sellerId: conexao.shop_id };
}
