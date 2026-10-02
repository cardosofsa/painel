"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

/** Marca a mensagem como enviada (ou pulada) para ela não voltar à lista nem ao sino (0061). */
export async function marcarMensagemEnviada(chave: string) {
  return comResultado(async () => {
    const k = validar(z.string().min(3).max(120), chave);
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
    const { error } = await supabase.from("mensagens_enviadas").upsert({ user_id: data.user.id, chave: k }, { onConflict: "user_id,chave", ignoreDuplicates: true });
    if (error?.code === "PGRST205" || error?.code === "42P01") throw new Error("Lembrar as mensagens enviadas precisa da migração 0061.");
    if (error) throw new Error(error.message);
    // Layout inteiro: o aviso sai também do sino do topo (e de Vixe → Mensagens).
    revalidatePath("/", "layout");
  });
}
