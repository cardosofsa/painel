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
