import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { credenciaisShopee } from "@/lib/marketplace/shopee-api";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";
import { enviarEstoqueConexao } from "@/lib/marketplace/estoque-servidor";

export const maxDuration = 60;

/**
 * Cron da Vercel (vercel.json): sincroniza todas as lojas conectadas. Só roda com
 * `CRON_SECRET` (a Vercel manda `Authorization: Bearer <CRON_SECRET>`), a service key e as
 * credenciais da Shopee. Sem qualquer um deles, responde 204 e não faz nada.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Serve às duas plataformas (10.8): a rota guarda o nome antigo porque o agendador já aponta para ela.
  if (!segredo || !service || (!credenciaisShopee() && !credenciaisML())) return new NextResponse(null, { status: 204 });

  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return new NextResponse("Não autorizado", { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, service, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("marketplace_conexoes")
    .select("*")
    .in("plataforma", [...(credenciaisShopee() ? ["shopee"] : []), ...(credenciaisML() ? ["mercadolivre"] : [])]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const resumo: { loja: string; ok: boolean; pedidos?: number; estoque?: number; erro?: string }[] = [];
  for (const conexao of (data ?? []) as ConexaoShopee[]) {
    try {
      const r = await sincronizarConexao(supabase, conexao, "servico");
      // Depois dos pedidos (que baixam estoque), o estoque vai para os anúncios (0049).
      const e = await enviarEstoqueConexao(supabase, conexao).catch(() => ({ enviados: 0, erros: [] as string[] }));
      resumo.push({ loja: conexao.loja_id, ok: true, pedidos: r.pedidos, estoque: e.enviados });
    } catch (e) {
      resumo.push({ loja: conexao.loja_id, ok: false, erro: e instanceof Error ? e.message : "erro" });
    }
  }
  return NextResponse.json({ lojas: resumo.length, resumo });
}
