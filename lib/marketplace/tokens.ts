import "server-only";
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
  /** 0090: retornos (devoluções) sincronizados à parte dos pedidos. */
  ultima_sincronizacao_retornos?: string | null;
  /** 0049: estoque do Sertão enviado sozinho para os anúncios desta loja. */
  estoque_auto?: boolean;
  /** 0049: quando o dono conferiu a prévia e ativou (sem isso, nada é enviado). */
  estoque_confirmado_em?: string | null;
  anuncios_atualizados_em?: string | null;
}

/** AAD do cofre: o token de uma loja não decifra na linha de outra. */
export const aadToken = (userId: string, lojaId: string) => `${userId}:shopee:${lojaId}`;

/** Quanto antes de vencer o token já é renovado (evita vencer no meio de uma sincronização). */
const MARGEM_RENOVACAO_MS = 2 * 60 * 1000;

type Renovados = { accessToken: string; refreshToken: string; expiraEm: string };

/**
 * Access token válido da conexão; renova quando vence. O refresh_token das duas plataformas é
 * de USO ÚNICO, então:
 *
 * - a gravação do token novo é conferida (antes, na Shopee, um erro ali era ignorado: o refresh
 *   novo se perdia e a loja caía na próxima renovação);
 * - se a renovação falha, outra (o cron, outra aba) pode ter gastado o mesmo refresh_token e
 *   gravado o par novo: relê a conexão por alguns segundos e usa o que ela gravou, em vez de
 *   dar a loja como desconectada.
 */
export async function tokenValido(supabase: SupabaseClient, conexao: ConexaoShopee, aad: string, renovar: (refresh: string) => Promise<Renovados>, plataforma: string): Promise<string> {
  const vence = conexao.expira_em ? new Date(conexao.expira_em).getTime() : 0;
  if (vence - MARGEM_RENOVACAO_MS > Date.now()) return decifrar(conexao.access_token_cifrado!, aad);
  const refreshAntes = conexao.refresh_token_cifrado!;
  let novos: Renovados;
  try {
    novos = await renovar(decifrar(refreshAntes, aad));
  } catch (e) {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const { data } = await supabase.from("marketplace_conexoes").select("access_token_cifrado, refresh_token_cifrado, expira_em").eq("id", conexao.id).maybeSingle();
      const atual = data as Pick<ConexaoShopee, "access_token_cifrado" | "refresh_token_cifrado" | "expira_em"> | null;
      if (atual?.access_token_cifrado && atual.refresh_token_cifrado && atual.refresh_token_cifrado !== refreshAntes && atual.expira_em && new Date(atual.expira_em).getTime() > Date.now()) {
        Object.assign(conexao, atual);
        return decifrar(atual.access_token_cifrado, aad);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw e;
  }
  const cifrados = { access_token_cifrado: cifrar(novos.accessToken, aad), refresh_token_cifrado: cifrar(novos.refreshToken, aad), expira_em: novos.expiraEm };
  const { error } = await supabase.from("marketplace_conexoes").update(cifrados).eq("id", conexao.id);
  if (error) throw new Error(`Não foi possível guardar o token renovado ${plataforma}. Tente de novo; se continuar, conecte a loja outra vez.`);
  Object.assign(conexao, cifrados);
  return novos.accessToken;
}

/** Credenciais, token válido (renova e regrava cifrado se venceu) e shop_id da conexão. */
export async function tokenDaConexao(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<{ c: CredenciaisShopee; token: string; shopId: number }> {
  const c = credenciaisShopee();
  if (!c) throw new Error("A integração com a Shopee não está ligada neste sistema (faltam SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY).");
  if (!conexao.access_token_cifrado || !conexao.refresh_token_cifrado) throw new Error("Loja sem autorização. Conecte de novo.");
  const aad = aadToken(conexao.user_id, conexao.loja_id);
  const shopId = Number(conexao.shop_id);
  const token = await tokenValido(supabase, conexao, aad, (refresh) => renovarToken(c, refresh, shopId), "da Shopee");
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
  const token = await tokenValido(supabase, conexao, aad, (refresh) => renovarTokenML(c, refresh), "do Mercado Livre");
  return { token, sellerId: conexao.shop_id };
}
