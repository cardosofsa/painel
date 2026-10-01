"use server";

import { createClient } from "@/lib/supabase/server";
import { gerarDiagnosticoPrecoIA, gerarFerramentaIA, gerarVitrineIA } from "@/lib/ia/gerar";
import type { FerramentaTexto } from "@/lib/ia/prompts-textos";

/** Vixe Preço: diagnóstico e estratégias. Os números vêm prontos da tela (`lib/vixe/preco.ts`). */
export async function pedirDiagnosticoPreco(contexto: unknown) {
  const supabase = await createClient();
  return gerarDiagnosticoPrecoIA(supabase, contexto);
}

/** Ferramentas de texto (7.7): responder cliente, cobrança, legenda e ficha técnica. */
export async function gerarTextoVixe(ferramenta: FerramentaTexto, contexto: unknown) {
  const supabase = await createClient();
  return gerarFerramentaIA(supabase, ferramenta, contexto);
}

/** Vixe Vitrine (7.9): tema + seções a partir das respostas do dono. Não grava nada. */
export async function gerarVitrineVixe(contexto: unknown) {
  const supabase = await createClient();
  return gerarVitrineIA(supabase, contexto);
}
