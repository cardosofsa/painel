import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { AdminClient, type ContaAdmin } from "./AdminClient";
import type { LinhaHistorico } from "./HistoricoAdmin";
import { PedidosPlano } from "@/components/admin/PedidosPlano";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Administração" };

export default async function AdminPage() {
  const supabase = await createClient();

  // As duas RPCs/tabelas são security definer / RLS `e_master()` por dentro — o middleware
  // já barrou quem não é master antes de chegar aqui, mas a trava que vale é a do banco.
  const [contasRes, historicoRes, pedidosRes, planosRes] = await Promise.all([
    supabase.rpc("admin_listar_contas"),
    supabase
      .from("historico_admin")
      .select("id, admin_email, alvo_user_id, alvo_email, acao, detalhes, criado_em")
      .order("criado_em", { ascending: false })
      .limit(200),
    // Pedidos de troca de plano (0057). Sem a migração, vazio.
    supabase.from("assinaturas").select("user_id, plano_solicitado, solicitado_em").not("plano_solicitado", "is", null).order("solicitado_em"),
    supabase.from("planos").select("id, nome"),
  ]);

  if (contasRes.error) lancarErroSupabase(contasRes.error);
  // Histórico é secundário: se a tabela ainda não existir (0023 não aplicada), a aba de
  // Contas continua funcionando — só a de Histórico fica vazia.
  if (historicoRes.error) console.error("[admin] falha ao carregar histórico:", historicoRes.error.message);

  const contas = (contasRes.data ?? []) as ContaAdmin[];
  const nomePlano = new Map(((planosRes.data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]));
  const pedidos = (pedidosRes.error ? [] : (pedidosRes.data ?? [])).map((p) => ({
    user_id: p.user_id as string,
    email: contas.find((c) => c.user_id === p.user_id)?.email ?? "conta",
    plano: nomePlano.get(p.plano_solicitado as string) ?? String(p.plano_solicitado),
    solicitado_em: p.solicitado_em as string | null,
  }));

  return (
    <>
      <PedidosPlano pedidos={pedidos} />
      <AdminClient contas={contas} historico={(historicoRes.data ?? []) as LinhaHistorico[]} />
    </>
  );
}
