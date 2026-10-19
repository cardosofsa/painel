import { createClient } from "@/lib/supabase/server";
import type { CustoAvulso } from "@/lib/custos-avulsos";
import { CustosClient, type HistoricoCusto } from "./CustosClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Registrar custo" };

export default async function CustosPage() {
  const supabase = await createClient();
  const [custosRes, historicoRes] = await Promise.all([
    supabase.from("custos_avulsos").select("id, nome, unidade, custo, grupo, observacao, ativo, atualizado_em").order("nome").limit(2000),
    supabase.from("custos_avulsos_historico").select("custo_id, custo_anterior, custo_novo, alterado_em").order("alterado_em", { ascending: false }).limit(500),
  ]);
  // Sem a 0112 as tabelas não existem: a tela explica em vez de quebrar.
  const semMigracao = !!custosRes.error;
  const custos = ((custosRes.data ?? []) as CustoAvulso[]).map((c) => ({ ...c, custo: Number(c.custo) }));
  const historico = ((historicoRes.data ?? []) as HistoricoCusto[]).map((h) => ({ ...h, custo_anterior: Number(h.custo_anterior), custo_novo: Number(h.custo_novo) }));
  return <CustosClient custos={custos} historico={historico} semMigracao={semMigracao} />;
}
