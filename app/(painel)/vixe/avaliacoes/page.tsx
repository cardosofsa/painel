import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { VixeAvaliacoes } from "@/components/vixe/VixeAvaliacoes";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vixe · Avaliações" };

/** Vixe → Avaliações (onda B): avaliações da Shopee com resposta escrita pela IA. */
export default async function VixeAvaliacoesPage() {
  const supabase = await createClient();
  const [perfilRes, iaDisponivel] = await Promise.all([supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(), iaDisponivelParaConta(supabase)]);
  return <VixeAvaliacoes nomeNegocio={(perfilRes.data?.nome_negocio as string | null)?.trim() || null} iaDisponivel={iaDisponivel} />;
}
