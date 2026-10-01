"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { PLATAFORMAS } from "@/lib/marketplace/plataformas";

const entradaSchema = z
  .object({
    plataforma: z.string(),
    /** Canal existente, ou null para criar o da plataforma (com as faixas padrão). */
    canal_id: z.string().uuid().nullable(),
    /** Loja existente do canal, ou null para criar com `nome_loja`. */
    loja_id: z.string().uuid().nullable(),
    nome_loja: z.string().trim().max(120).nullable(),
  })
  .refine((v) => v.loja_id || (v.nome_loja && v.nome_loja.length >= 2), { message: "Dê um nome para a loja (como ela aparece na Shopee)." });

/**
 * Passo de dados do assistente "Conectar marketplace": garante o canal (cria com as
 * faixas padrão se preciso) e a loja, e devolve o id da loja para a autorização OAuth.
 */
export async function prepararLojaMarketplace(entrada: z.input<typeof entradaSchema>) {
  return comResultado(async (): Promise<{ lojaId: string; canalId: string }> => {
    const v = validar(entradaSchema, entrada);
    const plat = PLATAFORMAS.find((p) => p.id === v.plataforma && p.disponivel);
    if (!plat) throw new Error("Esta plataforma ainda não tem integração.");
    const supabase = await createClient();

    let canalId = v.canal_id;
    if (canalId) {
      const { data, error } = await supabase.from("canais").select("id").eq("id", canalId).maybeSingle();
      if (error) lancarErroSupabase(error);
      if (!data) throw new Error("Canal não encontrado.");
    } else {
      const { data, error } = await supabase.from("canais").insert(plat.canal).select("id").single();
      if (error) lancarErroSupabase(error);
      canalId = data!.id as string;
      if (plat.faixas.length) {
        const { error: e2 } = await supabase
          .from("faixas_comissao_canal")
          .insert(plat.faixas.map((f, i) => ({ canal_id: canalId, ordem: i + 1, ...f })));
        if (e2) lancarErroSupabase(e2);
      }
    }

    let lojaId = v.loja_id;
    if (lojaId) {
      const { data, error } = await supabase.from("lojas_canal").select("id").eq("id", lojaId).eq("canal_id", canalId).maybeSingle();
      if (error) lancarErroSupabase(error);
      if (!data) throw new Error("Loja não encontrada neste canal.");
    } else {
      const { data, error } = await supabase
        .from("lojas_canal")
        .insert({ canal_id: canalId, nome: v.nome_loja!, logo_path: null, link: null, comissao_pct: null, taxa_fixa: null, taxa_extra_valor: null, taxa_extra_tipo: null })
        .select("id")
        .single();
      if (error) lancarErroSupabase(error);
      lojaId = data!.id as string;
    }

    revalidatePath("/configuracoes");
    revalidatePath("/precificacao");
    revalidatePath("/vendas");
    return { lojaId: lojaId!, canalId: canalId! };
  });
}
