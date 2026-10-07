import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cota da cotação de frete da vitrine (0077). Cada cotação gasta o token do Melhor Envio do
 * dono do catálogo, e a rota é pública: o freio mora no banco (`vitrine_frete_permitido`, só a
 * service role executa), por (catálogo, hash do IP) e por catálogo no dia.
 *
 * Antes da 0077 a RPC não existe: a rota segue como sempre, mas ainda recusa catálogo de
 * conta suspensa pela `conta_ativa_de` (0026), se ela responder.
 */

export type DecisaoCotaFrete = "livre" | "limitada" | "inativa";

export const MENSAGEM_LIMITE_FRETE = "Muitas cotações de frete em pouco tempo. Aguarde alguns minutos ou finalize e combine a entrega com a loja.";

/** Erro de função ausente no PostgREST/Postgres (migração ainda não aplicada). */
export function funcaoAusente(erro: { code?: string | null } | null | undefined): boolean {
  return erro?.code === "PGRST202" || erro?.code === "42883";
}

/**
 * `permitido`: resposta da RPC (null = RPC ausente ou com erro). `contaAtiva`: resposta da
 * `conta_ativa_de` (null = não deu para saber). A RPC devolve false tanto para "passou do
 * limite" quanto para "conta suspensa"; a conta desempata.
 */
export function decidirCotaFrete(permitido: boolean | null, contaAtiva: boolean | null): DecisaoCotaFrete {
  if (permitido === true) return "livre";
  if (contaAtiva === false) return "inativa";
  return permitido === false ? "limitada" : "livre";
}

async function contaAtivaDe(servico: SupabaseClient, dono: string): Promise<boolean | null> {
  const { data, error } = await servico.rpc("conta_ativa_de", { p_user_id: dono });
  if (error) return null;
  return data === true;
}

/** Consulta (e consome) a cota. Com a service key: a RPC não é executável por anon/authenticated. */
export async function conferirCotaFrete(servico: SupabaseClient, slug: string, ipHash: string | null, dono: string): Promise<DecisaoCotaFrete> {
  const { data, error } = await servico.rpc("vitrine_frete_permitido", { p_slug: slug, p_ip_hash: ipHash });
  if (error && !funcaoAusente(error)) console.error("[vitrine] cota do frete:", error.code, error.message);
  const permitido = error ? null : data === true;
  if (permitido === true) return "livre";
  return decidirCotaFrete(permitido, await contaAtivaDe(servico, dono));
}
