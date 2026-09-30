"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { comResultado } from "@/lib/acao";
import { validar, catalogoAparenciaSchema, secoesVitrineSchema } from "@/lib/validacao";
import { normalizarSecoes } from "@/lib/vixe/vitrine";
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

const idCatalogo = z.string().uuid("Catálogo inválido");
const temaAplicarSchema = catalogoAparenciaSchema.omit({ logo_url: true });

/**
 * Aplica o que a Vixe montou no catálogo escolhido. O logo NÃO entra no upsert: numa linha
 * que já existe, o PostgREST só atualiza as colunas enviadas, então o logo do dono fica.
 * As seções passam de novo por `normalizarSecoes` — o cliente poderia mandar qualquer coisa.
 */
export async function aplicarVitrineVixe(catalogoId: string, tema: unknown, secoes: unknown) {
  return comResultado(async () => {
    const id = validar(idCatalogo, catalogoId);
    const t = validar(temaAplicarSchema, tema);
    const s = validar(secoesVitrineSchema, normalizarSecoes(secoes));
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Entre de novo.");
    const { error } = await supabase
      .from("catalogo_aparencia")
      .upsert(
        { catalogo_id: id, user_id: user.id, ...t, secoes: Object.keys(s).length ? s : null, atualizado_em: new Date().toISOString() },
        { onConflict: "catalogo_id" },
      );
    if (error) lancarErroSupabase(error);
    revalidatePath("/catalogo");
    revalidatePath("/vixe/vitrine");
  });
}

/** Tira as seções da Vixe da vitrine; cores e logo continuam. */
export async function removerSecoesVitrine(catalogoId: string) {
  return comResultado(async () => {
    const id = validar(idCatalogo, catalogoId);
    const supabase = await createClient();
    const { error } = await supabase.from("catalogo_aparencia").update({ secoes: null }).eq("catalogo_id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/vixe/vitrine");
  });
}
