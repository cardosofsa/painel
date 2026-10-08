import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clienteServico } from "@/lib/supabase/servico";
import { atualizarFechamentos, contasAtivas } from "@/lib/fechamento-servidor";
import { hojeIsoBrasil } from "@/lib/format";
import { registrarFalhasCron } from "@/lib/cron-falhas";

export const maxDuration = 60;

const ROTA = "/api/cron/fechamento";
const PREFIXO = "Fechamento mensal";

/**
 * Cron diário (vercel.json): guarda a foto financeira de cada conta ativa em
 * `fechamentos_mensais` (0088) — saldo e projeção do mês corrente — e, no dia 1º, fecha o
 * mês que passou. Roda antes do cron da Shopee para pegar o saldo de antes da sincronização.
 *
 * Cliente de SERVIÇO (sem sessão; ignora RLS): `atualizarFechamentos` filtra `user_id` em
 * toda consulta. Só roda com `CRON_SECRET` e a service key; sem eles, 204 e nada acontece.
 * Cada falha vai para o `erros_app` (Admin → Erros), sem o user_id.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const supabase = clienteServico();
  if (!segredo || !supabase) return new NextResponse(null, { status: 204 });

  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return new NextResponse("Não autorizado", { status: 401 });

  let contas: string[];
  try {
    contas = await contasAtivas(supabase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    await registrarFalhasCron(ROTA, PREFIXO, [`não leu as contas: ${msg}`]);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }

  const hoje = hojeIsoBrasil();
  const resumo: { ok: number; erros: string[] } = { ok: 0, erros: [] };
  const falhas: string[] = [];
  const inicio = Date.now();
  for (const [i, userId] of contas.entries()) {
    // Margem para o limite de 60 s da função: o que sobrar fica para a próxima execução.
    if (Date.now() - inicio > 50_000) {
      resumo.erros.push("tempo esgotado; contas restantes ficam para a próxima execução");
      falhas.push(`tempo esgotado; ${contas.length - i} de ${contas.length} contas ficaram sem foto hoje`);
      break;
    }
    try {
      await atualizarFechamentos(supabase, userId, hoje);
      resumo.ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      resumo.erros.push(`${userId.slice(0, 8)}: ${msg}`);
      falhas.push(`uma conta ficou sem foto: ${msg}`);
    }
  }
  await registrarFalhasCron(ROTA, PREFIXO, falhas);
  return NextResponse.json(resumo);
}
