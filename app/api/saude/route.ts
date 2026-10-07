import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clienteServico } from "@/lib/supabase/servico";
import { credenciaisShopee } from "@/lib/marketplace/shopee-api";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { hojeIsoBrasil } from "@/lib/format";
import {
  bancoRespondeu,
  comTempoLimite,
  idadeSincronizacaoMaisAntigaMin,
  montarSaude,
  TEMPO_LIMITE_SAUDE_MS,
  variaveisPresentes,
  type ConexaoParaSaude,
  type Saude,
} from "@/lib/saude";

export const dynamic = "force-dynamic";

/**
 * Health check para o monitor externo (UptimeRobot / Better Stack, ver docs/monitoramento.md).
 * PÚBLICO e sem dado de conta: booleanos de presença das variáveis, se o banco respondeu e
 * a idade agregada da sincronização mais antiga. 200 quando o banco responde; 503 quando não.
 *
 * - Banco: `planos_publicos()` (0068) pela chave ANÔNIMA, a mesma consulta barata da landing.
 * - Sincronização: com a service key (sem RLS), só `user_id`/datas das conexões e das contas
 *   ativas, para calcular UM número. Nenhum id sai daqui.
 * Cada consulta tem tempo limite curto; a resposta nunca vai para cache.
 */

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" };

async function checarBanco(): Promise<{ ok: boolean; ms: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return { ok: false, ms: 0 };
  const inicio = Date.now();
  try {
    const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await comTempoLimite(supabase.rpc("planos_publicos").abortSignal(AbortSignal.timeout(TEMPO_LIMITE_SAUDE_MS)), TEMPO_LIMITE_SAUDE_MS + 500);
    return { ok: bancoRespondeu(error), ms: Date.now() - inicio };
  } catch {
    return { ok: false, ms: Date.now() - inicio };
  }
}

/** Minutos desde a sincronização mais antiga entre as conexões ativas. Null se não há o que medir ou se não deu para medir. */
async function idadeSincronizacao(): Promise<number | null> {
  const servico = clienteServico();
  const plataformas = [...(credenciaisShopee() ? ["shopee"] : []), ...(credenciaisML() ? ["mercadolivre"] : [])];
  if (!servico || !plataformas.length) return null;
  try {
    const sinal = AbortSignal.timeout(TEMPO_LIMITE_SAUDE_MS);
    // As duas em paralelo, sem `.in(user_id, ...)` (lista longa estoura a URL): são poucas contas.
    const [conexoes, ativas] = await comTempoLimite(
      Promise.all([
        servico
          .from("marketplace_conexoes")
          .select("user_id, ultima_sincronizacao, criado_em")
          .in("plataforma", plataformas)
          .not("refresh_token_cifrado", "is", null)
          .limit(5000)
          .abortSignal(sinal),
        // Mesma regra de `conta_ativa_de` (0026): ativa e não vencida.
        servico.from("perfis_acesso").select("user_id").eq("status", "ativo").or(`expira_em.is.null,expira_em.gte.${hojeIsoBrasil()}`).limit(5000).abortSignal(sinal),
      ]),
      TEMPO_LIMITE_SAUDE_MS + 500,
    );
    if (conexoes.error || ativas.error) return null;
    const contas = new Set((ativas.data ?? []).map((a) => a.user_id as string));
    return idadeSincronizacaoMaisAntigaMin((conexoes.data ?? []) as ConexaoParaSaude[], contas, Date.now());
  } catch {
    return null;
  }
}

async function verificar(): Promise<Saude> {
  const [banco, sincronizacaoMin] = await Promise.all([checarBanco(), idadeSincronizacao()]);
  return montarSaude({ banco, variaveis: variaveisPresentes(), sincronizacaoMin, agora: new Date() });
}

export async function GET() {
  const saude = await verificar();
  return NextResponse.json(saude, { status: saude.banco.ok ? 200 : 503, headers: SEM_CACHE });
}

/** Alguns monitores usam HEAD por padrão: mesmo código, sem corpo. */
export async function HEAD() {
  const saude = await verificar();
  return new NextResponse(null, { status: saude.banco.ok ? 200 : 503, headers: SEM_CACHE });
}
