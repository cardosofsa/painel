import { createClient } from "@/lib/supabase/server";
import { normalizarAbas } from "@/lib/acesso";
import { carregarAlertasVixe } from "@/lib/vixe/carregar-alertas";
import { CentralAlertas } from "@/components/vixe/CentralAlertas";

export default async function VixeAlertasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Mesmo filtro da layout: a policy de `perfis_acesso` deixa o master ler todas as linhas.
  const { data: perfil } = await supabase.from("perfis_acesso").select("abas").eq("user_id", user?.id ?? "").maybeSingle();

  const resultado = await carregarAlertasVixe(supabase, normalizarAbas(perfil?.abas ?? []));
  return <CentralAlertas {...resultado} />;
}
