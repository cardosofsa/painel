import { createClient } from "@/lib/supabase/server";
import { carregarMensagens } from "@/lib/vixe/mensagens-servidor";
import { VixeMensagens } from "@/components/vixe/VixeMensagens";
import { CalendarioComercial } from "@/components/vixe/CalendarioComercial";
import { ufDoCalendario } from "@/lib/calendario-servidor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vixe · Mensagens" };

/** Vixe → Mensagens (11.6): WhatsApp semi-automático, resumo do dia e calendário comercial. */
export default async function VixeMensagensPage() {
  const supabase = await createClient();
  const [dados, uf] = await Promise.all([carregarMensagens(supabase), ufDoCalendario(supabase)]);
  return (
    <div className="space-y-4">
      <VixeMensagens dados={dados} />
      <CalendarioComercial hoje={new Date()} uf={uf} />
    </div>
  );
}
