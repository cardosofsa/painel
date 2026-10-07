import { NextResponse, type NextRequest } from "next/server";
import { ErroWebhookNaoAutorizado, provedorCobranca, type EventoCobranca } from "@/lib/cobranca";
import { decidirEvento, type AssinaturaGravada } from "@/lib/cobranca/mesclar";
import { clienteServico } from "@/lib/supabase/servico";

/**
 * Webhook do provedor de cobrança (10.9). Sem provedor ligado responde 404. Com provedor:
 *   * autenticação inválida → 401 (o provedor mostra a falha no painel dele);
 *   * evento que não nos diz respeito ou já aplicado → 200 sem gravar (idempotente: a regra
 *     está em `lib/cobranca/mesclar.ts`);
 *   * falha passageira (rede, banco) → 500, e o provedor reenvia.
 * Grava com a service key, SEMPRE filtrando o `user_id` que veio no evento autenticado.
 * Erro que reenvio não resolve (plano ou conta que não existem) responde 200: o Asaas pausa a
 * fila inteira depois de várias falhas seguidas, e isso travaria os eventos das outras contas.
 */
export async function POST(req: NextRequest) {
  const provedor = provedorCobranca();
  const servico = clienteServico();
  if (!provedor || !servico) return new NextResponse(null, { status: 404 });

  let evento;
  try {
    evento = await provedor.interpretarWebhook(req);
  } catch (e) {
    if (e instanceof ErroWebhookNaoAutorizado) return new NextResponse(null, { status: 401 });
    console.error("[cobranca] webhook: falha ao interpretar:", e instanceof Error ? e.message : e);
    return new NextResponse(null, { status: 500 });
  }
  if (!evento) return new NextResponse(null, { status: 200 });

  const { data: atual, error: erroLeitura } = await servico
    .from("assinaturas")
    .select("plano_id, status, periodo_fim, provedor, provedor_ref, periodo_fim_provedor, dias_bonus, provedor_refs_encerradas, provedor_pagamentos_estornados, cancelamento_agendado")
    .eq("user_id", evento.userId)
    .maybeSingle<AssinaturaGravada>();
  if (erroLeitura) {
    console.error("[cobranca] webhook: leitura:", erroLeitura.message);
    return new NextResponse(null, { status: 500 });
  }

  const decisao = decidirEvento(atual ?? null, evento, provedor.id);
  if (!decisao.gravar) return desfazerBonus(servico, evento);

  const linha = { ...decisao.linha, atualizado_em: new Date().toISOString() };
  const { error } = atual
    ? await servico.from("assinaturas").update(linha).eq("user_id", evento.userId)
    : await servico.from("assinaturas").upsert({ user_id: evento.userId, ...linha }, { onConflict: "user_id" });
  if (error) {
    // 23503: plano ou conta inexistente. Reenviar não resolve.
    console.error("[cobranca] webhook: gravação:", error.code, error.message);
    return new NextResponse(null, { status: error.code === "23503" || error.code === "23514" ? 200 : 500 });
  }

  // Troca de plano: a assinatura nova foi paga, a antiga para de cobrar. O "encerrada" que o
  // provedor manda depois é ignorado (não é mais a assinatura gravada).
  if (decisao.cancelarRef && provedor.cancelarAssinatura) {
    await provedor.cancelarAssinatura(decisao.cancelarRef).catch((e) => console.error("[cobranca] webhook: cancelar anterior:", e instanceof Error ? e.message : e));
  }
  return desfazerBonus(servico, evento);
}

/**
 * Estorno do pagamento que gerou a recompensa de indicação: tira os 30 dias das duas contas.
 * Roda mesmo quando o período já tinha sido ajustado (reenvio depois de uma falha aqui): a
 * função do banco só desfaz uma vez (0082).
 */
async function desfazerBonus(servico: NonNullable<ReturnType<typeof clienteServico>>, evento: EventoCobranca) {
  if (evento.status !== "estornada" || !evento.pagamentoRef) return new NextResponse(null, { status: 200 });
  const { error } = await servico.rpc("desfazer_bonus_indicacao", { p_indicado: evento.userId, p_pagamento: evento.pagamentoRef });
  if (error) {
    console.error("[cobranca] webhook: desfazer bônus:", error.code, error.message);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
