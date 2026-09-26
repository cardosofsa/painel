import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { AdminClient, type ContaAdmin } from "./AdminClient";
import type { LinhaHistorico } from "./HistoricoAdmin";

export default async function AdminPage() {
  const supabase = await createClient();

  // As duas RPCs/tabelas são security definer / RLS `e_master()` por dentro — o middleware
  // já barrou quem não é master antes de chegar aqui, mas a trava que vale é a do banco.
  const [contasRes, historicoRes] = await Promise.all([
    supabase.rpc("admin_listar_contas"),
    supabase
      .from("historico_admin")
      .select("id, admin_email, alvo_user_id, alvo_email, acao, detalhes, criado_em")
      .order("criado_em", { ascending: false })
      .limit(200),
  ]);

  if (contasRes.error) lancarErroSupabase(contasRes.error);
  // Histórico é secundário: se a tabela ainda não existir (0023 não aplicada), a aba de
  // Contas continua funcionando — só a de Histórico fica vazia.
  if (historicoRes.error) console.error("[admin] falha ao carregar histórico:", historicoRes.error.message);

  return (
    <AdminClient
      contas={(contasRes.data ?? []) as ContaAdmin[]}
      historico={(historicoRes.data ?? []) as LinhaHistorico[]}
    />
  );
}
