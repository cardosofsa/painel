"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensagemEnviadaSchema, modeloMensagemSchema, validar, type MensagemEnviadaInput, type ModeloMensagemInput } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";

const SEM_0069 = "Modelos de mensagem precisam da migração 0069.";
/** Coluna/tabela que ainda não existe: a 0069 não foi aplicada. */
const faltaMigracao = (code?: string) => code === "42703" || code === "PGRST204" || code === "PGRST205" || code === "42P01";

/**
 * Marca a mensagem como enviada (ou pulada) para ela não voltar à lista nem ao sino (0061).
 * Os detalhes (cliente, texto…) alimentam a aba "Enviadas" (0069); sem a 0069, grava só a
 * chave, como antes.
 */
export async function marcarMensagemEnviada(chave: string, detalhes?: Omit<MensagemEnviadaInput, "chave">) {
  return comResultado(async () => {
    const d = validar(mensagemEnviadaSchema, { chave, ...detalhes });
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
    const linha = { user_id: data.user.id, ...d };
    let { error } = await supabase.from("mensagens_enviadas").upsert(linha, { onConflict: "user_id,chave", ignoreDuplicates: true });
    if (error && faltaMigracao(error.code) && detalhes) ({ error } = await supabase.from("mensagens_enviadas").upsert({ user_id: data.user.id, chave: d.chave }, { onConflict: "user_id,chave", ignoreDuplicates: true }));
    if (error?.code === "PGRST205" || error?.code === "42P01") throw new Error("Lembrar as mensagens enviadas precisa da migração 0061.");
    if (error) lancarErroSupabase(error);
    // Layout inteiro: o aviso sai também do sino do topo (e de Vixe → Mensagens).
    revalidatePath("/", "layout");
  });
}

/** Grava o texto da conta para um tipo de aviso (0069). */
export async function salvarModeloMensagem(input: ModeloMensagemInput) {
  return comResultado(async () => {
    const d = validar(modeloMensagemSchema, input);
    const supabase = await createClient();
    const { error } = await supabase.from("mensagens_modelos").upsert({ assunto: d.assunto, texto: d.texto, atualizado_em: new Date().toISOString() }, { onConflict: "user_id,assunto" });
    if (error && faltaMigracao(error.code)) throw new Error(SEM_0069);
    if (error) lancarErroSupabase(error);
    revalidatePath("/", "layout");
  });
}

/** Volta ao texto padrão do sistema (apaga o da conta). */
export async function restaurarModeloMensagem(assunto: ModeloMensagemInput["assunto"]) {
  return comResultado(async () => {
    const { assunto: a } = validar(modeloMensagemSchema.pick({ assunto: true }), { assunto });
    const supabase = await createClient();
    const { error } = await supabase.from("mensagens_modelos").delete().eq("assunto", a);
    if (error && faltaMigracao(error.code)) throw new Error(SEM_0069);
    if (error) lancarErroSupabase(error);
    revalidatePath("/", "layout");
  });
}
