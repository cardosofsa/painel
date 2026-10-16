import { createClient } from "@/lib/supabase/server";
import { carregarDadosInsights } from "@/lib/consultor/carregar";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { InsightsClient } from "./InsightsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights de anúncios" };

export default async function InsightsPage() {
  const supabase = await createClient();
  const [dados, iaDisponivel] = await Promise.all([carregarDadosInsights(supabase), iaDisponivelParaConta(supabase)]);
  return (
    <InsightsClient
      pedidos={dados.pedidos}
      anuncios={dados.anuncios}
      ads={dados.ads}
      lojas={dados.lojas}
      agoraIso={new Date().toISOString()}
      semDados={!dados.disponivel}
      iaDisponivel={iaDisponivel}
    />
  );
}
