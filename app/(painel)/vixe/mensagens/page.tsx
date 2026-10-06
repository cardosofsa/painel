import { createClient } from "@/lib/supabase/server";
import { carregarMensagens } from "@/lib/vixe/mensagens-servidor";
import { VixeMensagens } from "@/components/vixe/VixeMensagens";
import { CalendarioComercial } from "@/components/vixe/CalendarioComercial";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vixe · Mensagens" };

/** Vixe → Mensagens (11.6): WhatsApp semi-automático, resumo do dia e calendário comercial. */
export default async function VixeMensagensPage() {
  const supabase = await createClient();
  const dados = await carregarMensagens(supabase);
  return (
    <div className="space-y-4">
      <VixeMensagens dados={dados} />
      <CalendarioComercial hoje={new Date()} />
    </div>
  );
}
