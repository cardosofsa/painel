"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * "Lido" = ignorar. O alerta sai do sino e só volta a existir depois que o estoque subir
 * acima do mínimo e cruzar de novo (o gatilho da migração 0034 resolve o antigo sozinho).
 */
export async function marcarAlertaLido(id: string) {
  return comResultado(async () => {
    const v = validar(idSchema, { id });
    const supabase = await createClient();
    const { error } = await supabase
      .from("alertas")
      .update({ status: "lido", lido_em: new Date().toISOString() })
      .eq("id", v.id)
      .eq("status", "novo");
    if (error) lancarErroSupabase(error);
    revalidatePath("/", "layout");
  });
}

export async function marcarTodosAlertasLidos() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("alertas")
      .update({ status: "lido", lido_em: new Date().toISOString() })
      .eq("status", "novo");
    if (error) lancarErroSupabase(error);
    revalidatePath("/", "layout");
  });
}
