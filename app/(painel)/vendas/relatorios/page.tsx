import { createClient } from "@/lib/supabase/server";
import { carregarVendasRelatorio } from "@/lib/relatorios-servidor";
import { RelatoriosVendasClient } from "./RelatoriosVendasClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Relatórios de vendas" };

/** Até um ano (mais o ano anterior para comparar os 365 dias). */
const DIAS = 730;

export default async function RelatoriosVendasPage() {
  const supabase = await createClient();
  const agora = new Date();
  const vendas = await carregarVendasRelatorio(supabase, DIAS);
  return <RelatoriosVendasClient vendas={vendas} agoraIso={agora.toISOString()} />;
}
