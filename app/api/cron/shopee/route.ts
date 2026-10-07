import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clienteServico } from "@/lib/supabase/servico";
import { credenciaisShopee } from "@/lib/marketplace/shopee-api";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";
import { enviarEstoqueConexao } from "@/lib/marketplace/estoque-servidor";
import { plataformaDa } from "@/lib/marketplace/conexao-api";
import { registrarFalhasCron } from "@/lib/cron-falhas";

export const maxDuration = 60;

const ROTA = "/api/cron/shopee";
const PREFIXO = "Cron de sincronização";
const NOME = { shopee: "Shopee", mercadolivre: "Mercado Livre" } as const;
const mensagem = (e: unknown) => (e instanceof Error ? e.message : "erro");

/**
 * Cron da Vercel (vercel.json): sincroniza todas as lojas conectadas. Só roda com
 * `CRON_SECRET` (a Vercel manda `Authorization: Bearer <CRON_SECRET>`), a service key e as
 * credenciais da Shopee. Sem qualquer um deles, responde 204 e não faz nada.
 *
 * Cliente de SERVIÇO (`clienteServico`, sem RLS): `sincronizarConexao` e o envio de estoque
 * filtram `user_id` da conexão em toda consulta. Cada falha também vai para o `erros_app`
 * (Admin → Erros), sem dado de conta — o JSON da resposta ninguém lê.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const supabase = clienteServico();
  // Serve às duas plataformas (10.8): a rota guarda o nome antigo porque o agendador já aponta para ela.
  if (!segredo || !supabase || (!credenciaisShopee() && !credenciaisML())) return new NextResponse(null, { status: 204 });

  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return new NextResponse("Não autorizado", { status: 401 });

  const { data, error } = await supabase
    .from("marketplace_conexoes")
    .select("*")
    .in("plataforma", [...(credenciaisShopee() ? ["shopee"] : []), ...(credenciaisML() ? ["mercadolivre"] : [])]);
  if (error) {
    await registrarFalhasCron(ROTA, PREFIXO, [`não leu as conexões: ${error.message}`]);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const resumo: { loja: string; ok: boolean; pedidos?: number; estoque?: number; erro?: string }[] = [];
  const falhas: string[] = [];
  for (const conexao of (data ?? []) as ConexaoShopee[]) {
    const nome = NOME[plataformaDa(conexao)];
    try {
      const r = await sincronizarConexao(supabase, conexao, "servico");
      // Depois dos pedidos (que baixam estoque), o estoque vai para os anúncios (0049).
      const e = await enviarEstoqueConexao(supabase, conexao).catch((err: unknown) => {
        falhas.push(`estoque de uma loja ${nome} não foi enviado: ${mensagem(err)}`);
        return { enviados: 0, erros: [] as string[] };
      });
      // Sem o id do anúncio (vem como "Anúncio <id>: <erro>"): só o erro vai para o registro.
      if (e.erros.length) falhas.push(`estoque de uma loja ${nome}: ${e.erros.length} anúncio(s) com erro (${e.erros[0].replace(/^Anúncio [^:]*:\s*/, "")})`);
      resumo.push({ loja: conexao.loja_id, ok: true, pedidos: r.pedidos, estoque: e.enviados });
    } catch (e) {
      falhas.push(`uma loja ${nome} não sincronizou: ${mensagem(e)}`);
      resumo.push({ loja: conexao.loja_id, ok: false, erro: mensagem(e) });
    }
  }
  await registrarFalhasCron(ROTA, PREFIXO, falhas);
  return NextResponse.json({ lojas: resumo.length, resumo });
}
