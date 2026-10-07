import { after, NextResponse, type NextRequest } from "next/server";
import { clienteServico } from "@/lib/supabase/servico";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { lerNotificacaoML, sincronizouHaPouco, TAMANHO_MAXIMO_NOTIFICACAO } from "@/lib/marketplace/notificacao-ml";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";

export const maxDuration = 60;

/** O ML só quer saber se chegou: qualquer coisa que não seja 200 vira reenvio em loop. */
const recebido = () => new NextResponse(null, { status: 200 });

/**
 * Notificações do Mercado Livre (tópico orders_v2 / shipments). O ML espera 200 rápido e
 * reenvia se não receber; por isso responde SEMPRE 200, na hora, e sincroniza em `after()`.
 *
 * Não confia no corpo (`lerNotificacaoML`): ele precisa ser do NOSSO app (`application_id`
 * = `ML_CLIENT_ID`) e de um vendedor com conexão no Sertão; do `resource` sai só o número
 * do pedido, que é LIDO de novo na API com o token da loja. Notificação forjada no máximo
 * faz o Sertão reler um pedido de verdade. Sem service key ou credenciais, ignora.
 *
 * Segura repetição: o ML manda vários avisos seguidos, e a conexão que sincronizou há menos
 * de 60 s (`ultima_sincronizacao`) não sincroniza de novo. Quem grava essa data é a
 * sincronização completa (cron, botão, aviso de envio); o aviso de um pedido só relê aquele
 * pedido e não mexe nela, para não encurtar a janela da próxima sincronização completa.
 */
export async function POST(req: NextRequest) {
  const servico = clienteServico();
  const credenciais = credenciaisML();
  if (!servico || !credenciais) return recebido();
  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_NOTIFICACAO) return recebido();

  const aviso = lerNotificacaoML(await req.text().catch(() => ""), credenciais.clientId);
  if (!aviso.ok) return recebido();

  after(async () => {
    // Cliente de serviço (sem RLS): a conexão é achada pelo vendedor do ML, e a sincronização
    // filtra o user_id DESSA conexão em toda consulta.
    const { data, error } = await servico.from("marketplace_conexoes").select("*").eq("plataforma", "mercadolivre").eq("shop_id", aviso.sellerId);
    if (error) {
      console.error("[mercadolivre notificação] conexões:", error.message);
      return;
    }
    for (const conexao of (data ?? []) as ConexaoShopee[]) {
      // O freio só vale para a relida completa (aviso de envio). Aviso de um pedido relê só ele, é barato,
      // e descartá-lo perderia um pedido pago logo depois de uma sincronização completa.
      if (!aviso.pedido && sincronizouHaPouco(conexao.ultima_sincronizacao, Date.now())) continue;
      try {
        // Pedido: só ele. Envio (status da etiqueta/entrega): relê a janela recente.
        await sincronizarConexao(servico, conexao, "servico", aviso.pedido ? [aviso.pedido] : undefined);
      } catch (e) {
        console.error("[mercadolivre notificação]", e instanceof Error ? e.message : e);
      }
    }
  });
  return recebido();
}
