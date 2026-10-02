import { after, NextResponse, type NextRequest } from "next/server";
import { clienteServico } from "@/lib/supabase/servico";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";

export const maxDuration = 60;

/**
 * Notificações do Mercado Livre (tópico orders_v2 / shipments). O ML espera 200 rápido e
 * reenvia se não receber; por isso responde na hora e sincroniza o pedido em `after()`.
 *
 * Não confia no corpo: só usa o `user_id` para achar a conexão e o número do pedido do
 * `resource`, e então LÊ o pedido na API com o token da loja. Notificação forjada no
 * máximo faz o SERTÃO reler um pedido de verdade. Sem service key ou credenciais, ignora.
 */
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => null)) as { resource?: string; user_id?: number | string; topic?: string } | null;
  const servico = clienteServico();
  if (!corpo || !servico || !credenciaisML()) return new NextResponse(null, { status: 200 });

  const sellerId = String(corpo.user_id ?? "");
  const pedido = /^\/orders\/(\d{5,20})$/.exec(corpo.resource ?? "")?.[1];
  const envio = /^\/shipments\/(\d{5,20})$/.exec(corpo.resource ?? "")?.[1];
  if (!/^\d{3,20}$/.test(sellerId) || (!pedido && !envio)) return new NextResponse(null, { status: 200 });

  after(async () => {
    const { data } = await servico.from("marketplace_conexoes").select("*").eq("plataforma", "mercadolivre").eq("shop_id", sellerId);
    for (const conexao of (data ?? []) as ConexaoShopee[]) {
      try {
        // Pedido: só ele. Envio (status da etiqueta/entrega): relê a janela recente.
        await sincronizarConexao(servico, conexao, "servico", pedido ? [pedido] : undefined);
      } catch (e) {
        console.error("[mercadolivre notificação]", e instanceof Error ? e.message : e);
      }
    }
  });
  return new NextResponse(null, { status: 200 });
}
