import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import type { ContaAdmin } from "../AdminClient";
import type { LinhaHistorico } from "../HistoricoAdmin";
import { ContaDetalheClient, type UsoIa } from "./ContaDetalheClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Sem isso, um `id` malformado (link quebrado, digitado à mão) ainda dispara a RPC de
  // atividade, que falha no banco por erro de tipo — desnecessário, já que o formato dá
  // pra rejeitar sem gastar uma ida ao Postgres.
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();

  // `admin_listar_contas()` já é o conjunto pequeno de contas do sistema — não vale a pena
  // uma RPC dedicada só para buscar uma linha dele.
  const [contasRes, atividadeRes, historicoRes, cotaRes] = await Promise.all([
    supabase.rpc("admin_listar_contas"),
    supabase.rpc("admin_atividade_conta", { p_user_id: id, p_dias: 90 }),
    supabase
      .from("historico_admin")
      .select("id, admin_email, alvo_user_id, alvo_email, acao, detalhes, criado_em")
      .eq("alvo_user_id", id)
      .order("criado_em", { ascending: false })
      .limit(50),
    // Limite + consumo. `ia_uso` é legível só pelo dono, então o master passa por uma
    // porta explícita gated por `e_master()` em vez de afrouxar o RLS (0025).
    supabase.rpc("admin_uso_ia_conta", { p_user_id: id }).maybeSingle(),
  ]);

  if (contasRes.error) lancarErroSupabase(contasRes.error);

  const conta = ((contasRes.data ?? []) as ContaAdmin[]).find((c) => c.user_id === id);
  if (!conta) notFound();

  if (atividadeRes.error) console.error("[admin/detalhe] falha ao carregar atividade:", atividadeRes.error.message);
  if (historicoRes.error) console.error("[admin/detalhe] falha ao carregar histórico:", historicoRes.error.message);
  // Enquanto a 0025 não for aplicada a RPC não existe: cai em `null` e a tela esconde o
  // bloco, em vez de quebrar a página inteira do detalhe da conta.
  if (cotaRes.error) console.error("[admin/detalhe] falha ao carregar uso de IA:", cotaRes.error.message);

  return (
    <ContaDetalheClient
      conta={conta}
      atividade={(atividadeRes.data ?? []) as { dia: string; vendas: number; faturamento: number }[]}
      historico={(historicoRes.data ?? []) as LinhaHistorico[]}
      usoIa={(cotaRes.data as UsoIa | null) ?? null}
    />
  );
}
