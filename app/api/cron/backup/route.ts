import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clienteServico } from "@/lib/supabase/servico";
import { backupsParaApagar, caminhoBackup, montarBackup } from "@/lib/backup";
import { hojeIsoBrasil } from "@/lib/format";
import { registrarFalhasCron } from "@/lib/cron-falhas";

export const maxDuration = 60;

const ROTA = "/api/cron/backup";
const PREFIXO = "Backup semanal";

/**
 * Cron semanal (vercel.json, onda D): grava o backup de cada conta ativa no bucket privado
 * `backups` (0076) como `<user_id>/<data>.json` e guarda só os 4 mais recentes. Cada conta
 * baixa os seus em Configurações → Dados.
 *
 * Cliente de SERVIÇO (sem sessão; ignora RLS): `montarBackup` filtra `user_id` em toda
 * consulta. Só roda com `CRON_SECRET` e a service key; sem eles, 204 e nada acontece.
 *
 * Cada falha também vai para o `erros_app` (Admin → Erros), sem o user_id: o JSON da
 * resposta ninguém lê.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const supabase = clienteServico();
  if (!segredo || !supabase) return new NextResponse(null, { status: 204 });

  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return new NextResponse("Não autorizado", { status: 401 });

  const { data: contas, error } = await supabase.from("perfis_acesso").select("user_id").eq("papel", "usuario").eq("status", "ativo");
  if (error) {
    await registrarFalhasCron(ROTA, PREFIXO, [`não leu as contas: ${error.message}`]);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const hoje = hojeIsoBrasil();
  const resumo: { ok: number; erros: string[] } = { ok: 0, erros: [] };
  const falhas: string[] = [];
  const inicio = Date.now();
  const lista = (contas ?? []) as { user_id: string }[];
  for (const [i, { user_id }] of lista.entries()) {
    // Margem para o limite de 60 s da função: o que sobrar fica para a próxima semana.
    if (Date.now() - inicio > 50_000) {
      resumo.erros.push("tempo esgotado; contas restantes ficam para a próxima execução");
      falhas.push(`tempo esgotado; ${lista.length - i} de ${lista.length} contas ficaram sem backup nesta semana`);
      break;
    }
    try {
      const backup = await montarBackup(supabase, user_id);
      const corpo = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const up = await supabase.storage.from("backups").upload(caminhoBackup(user_id, hoje), corpo, { upsert: true, contentType: "application/json" });
      if (up.error) throw new Error(up.error.message);
      const { data: arquivos } = await supabase.storage.from("backups").list(user_id, { limit: 100 });
      const apagar = backupsParaApagar((arquivos ?? []).map((a) => a.name));
      if (apagar.length) await supabase.storage.from("backups").remove(apagar.map((n) => `${user_id}/${n}`));
      resumo.ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      resumo.erros.push(`${user_id.slice(0, 8)}: ${msg}`);
      falhas.push(`uma conta ficou sem backup: ${msg}`);
    }
  }
  await registrarFalhasCron(ROTA, PREFIXO, falhas);
  return NextResponse.json(resumo);
}
