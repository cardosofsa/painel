import { createClient } from "@/lib/supabase/server";
import { carregarMensagens } from "@/lib/vixe/mensagens-servidor";
import { VixeMensagens } from "@/components/vixe/VixeMensagens";
import { CalendarioComercial } from "@/components/vixe/CalendarioComercial";
import { ufDoCalendario } from "@/lib/calendario-servidor";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { urlDoSite } from "@/lib/site";

export const metadata: Metadata = { title: "Vixe · Mensagens" };

/** Vixe → Mensagens (11.6): WhatsApp semi-automático, resumo do dia e calendário comercial. */
export default async function VixeMensagensPage() {
  const supabase = await createClient();
  const [dados, uf, h] = await Promise.all([carregarMensagens(supabase), ufDoCalendario(supabase), headers()]);
  // Endereço do catálogo nas campanhas: o mesmo domínio em que a pessoa está, montado no
  // servidor para o texto sair igual no HTML e no navegador.
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origem = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : (urlDoSite() ?? "");
  return (
    <div className="space-y-4">
      <VixeMensagens dados={dados} origem={origem} />
      <CalendarioComercial hoje={new Date()} uf={uf} />
    </div>
  );
}
