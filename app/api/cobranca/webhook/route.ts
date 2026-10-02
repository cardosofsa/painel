import { NextResponse, type NextRequest } from "next/server";
import { provedorCobranca } from "@/lib/cobranca";
import { clienteServico } from "@/lib/supabase/servico";

/**
 * Webhook do provedor de cobrança (10.9). Sem provedor ligado responde 404. Com provedor,
 * ele valida a assinatura do evento e a assinatura da conta é gravada com a service key.
 */
export async function POST(req: NextRequest) {
  const provedor = provedorCobranca();
  const servico = clienteServico();
  if (!provedor || !servico) return new NextResponse(null, { status: 404 });
  const evento = await provedor.interpretarWebhook(req).catch(() => null);
  if (!evento) return new NextResponse(null, { status: 200 });
  const { error } = await servico
    .from("assinaturas")
    .upsert(
      { user_id: evento.userId, plano_id: evento.planoId, status: evento.status, periodo_fim: evento.periodoFim, provedor: provedor.id, provedor_ref: evento.provedorRef, plano_solicitado: null, solicitado_em: null, atualizado_em: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[cobranca] webhook:", error.message);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
