import { createClient } from "@/lib/supabase/server";
import { carregarRadar } from "@/lib/vixe/radar-servidor";
import { VixeRadar } from "@/components/vixe/VixeRadar";

/** Vixe → Radar (11.2): onde a loja perde dinheiro, por produto e canal. */
export default async function VixeRadarPage() {
  const supabase = await createClient();
  const dados = await carregarRadar(supabase, 30);
  return <VixeRadar dados={dados} />;
}
