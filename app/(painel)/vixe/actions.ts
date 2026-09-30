"use server";

import { createClient } from "@/lib/supabase/server";
import { gerarDiagnosticoPrecoIA } from "@/lib/ia/gerar";

/** Vixe Preço: diagnóstico e estratégias. Os números vêm prontos da tela (`lib/vixe/preco.ts`). */
export async function pedirDiagnosticoPreco(contexto: unknown) {
  const supabase = await createClient();
  return gerarDiagnosticoPrecoIA(supabase, contexto);
}
