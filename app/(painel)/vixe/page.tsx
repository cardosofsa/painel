import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { normalizarAbas } from "@/lib/acesso";
import { carregarAlertasVixe } from "@/lib/vixe/carregar-alertas";
import { CentralAlertas } from "@/components/vixe/CentralAlertas";
import { CalendarioComercial } from "@/components/vixe/CalendarioComercial";

export default async function VixeAlertasPage() {
  const supabase = await createClient();
  const perfil = await acessoAtual();

  const resultado = await carregarAlertasVixe(supabase, normalizarAbas(perfil?.abas ?? []));
  return (
    <div className="space-y-4">
      <CentralAlertas {...resultado} />
      <CalendarioComercial hoje={new Date()} janela={45} />
    </div>
  );
}
