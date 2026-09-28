import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import type { ContaAdmin } from "../AdminClient";
import type { LinhaHistorico } from "../HistoricoAdmin";
import { ContaDetalheClient } from "./ContaDetalheClient";

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
    // Leitura direta: a policy de `perfis_acesso` já deixa o master ler qualquer linha
    // (`auth.uid() = user_id or e_master()`), então isto não precisa de RPC nova. A
    // ESCRITA continua sendo só por `admin_definir_limite_ia`, que é onde a trava mora.
    supabase.from("perfis_acesso").select("ia_limite_diario").eq("user_id", id).maybeSingle(),
  ]);

  if (contasRes.error) lancarErroSupabase(contasRes.error);

  const conta = ((contasRes.data ?? []) as ContaAdmin[]).find((c) => c.user_id === id);
  if (!conta) notFound();

  if (atividadeRes.error) console.error("[admin/detalhe] falha ao carregar atividade:", atividadeRes.error.message);
  if (historicoRes.error) console.error("[admin/detalhe] falha ao carregar histórico:", historicoRes.error.message);
  // Enquanto a 0024 não for aplicada a coluna não existe: cai em `null` e a tela esconde
  // o controle, em vez de quebrar a página inteira do detalhe da conta.
  if (cotaRes.error) console.error("[admin/detalhe] falha ao carregar cota de IA:", cotaRes.error.message);

  const limiteIa = (cotaRes.data as { ia_limite_diario: number } | null)?.ia_limite_diario ?? null;

  return (
    <ContaDetalheClient
      conta={conta}
      atividade={(atividadeRes.data ?? []) as { dia: string; vendas: number; faturamento: number }[]}
      historico={(historicoRes.data ?? []) as LinhaHistorico[]}
      limiteIa={limiteIa}
    />
  );
}
