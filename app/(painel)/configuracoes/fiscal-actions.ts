"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { cifrar, cofreDisponivel } from "@/lib/ia/cofre";

/** Configurações → Fiscal (11.7). O token do emissor só existe em texto aqui dentro. */

const padrao = z.enum(["comprovante", "nfe", "perguntar"]);
const fiscalSchema = z.object({
  token: z.string().trim().max(500).optional(),
  ambiente: z.enum(["homologacao", "producao"]),
  serie: z.number().int().min(1).max(999),
  inscricao_estadual: z.string().trim().max(20).nullable(),
  crt: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  cfop_padrao: z.string().regex(/^\d{4}$/, "CFOP com 4 dígitos"),
  cfop_fora_estado: z.string().regex(/^\d{4}$/, "CFOP com 4 dígitos"),
  csosn_padrao: z.string().regex(/^\d{3}$/, "CSOSN com 3 dígitos"),
  pis_cofins_cst: z.string().regex(/^\d{2}$/, "CST com 2 dígitos"),
  natureza: z.string().trim().min(1).max(60),
  padrao_pdv: padrao,
  padrao_catalogo: padrao,
});


export async function salvarFiscal(dados: z.input<typeof fiscalSchema>) {
  return comResultado(async () => {
    const v = validar(fiscalSchema, dados);
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
    const { token, ...resto } = v;
    const linha: Record<string, unknown> = { ...resto, user_id: data.user.id, atualizado_em: new Date().toISOString() };
    if (token) {
      if (!cofreDisponivel()) throw new Error("O cofre de chaves não está configurado neste sistema. Avise o administrador.");
      linha.token_cifrado = cifrar(token, `${data.user.id}:fiscal`);
    }
    const { error } = await supabase.from("fiscal_config").upsert(linha, { onConflict: "user_id" });
    if (error?.code === "PGRST205" || error?.code === "42P01") throw new Error("O fiscal precisa da migração 0062.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/vendas");
  });
}

export async function desligarNfe() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
    const { error } = await supabase.from("fiscal_config").update({ token_cifrado: null }).eq("user_id", data.user.id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/vendas");
  });
}
