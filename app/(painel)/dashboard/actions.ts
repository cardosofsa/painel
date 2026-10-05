"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, compromissoSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

const PATH = "/dashboard";

export interface CompromissoInput {
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
}

export async function criarCompromisso(dados: CompromissoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").insert(validar(compromissoSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

export async function atualizarCompromisso(id: string, dados: CompromissoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").update(validar(compromissoSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

export async function removerCompromisso(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

/** "Primeiros passos" não aparece mais para esta conta (0065). */
export async function ocultarPrimeirosPassos() {
  return comResultado(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");
    const { error } = await supabase.from("perfil_negocio").upsert({ user_id: user.id, onboarding_oculto: true, atualizado_em: new Date().toISOString() });
    if (error?.code === "PGRST204" || error?.code === "42703") throw new Error("Ocultar precisa da migração 0065. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}
