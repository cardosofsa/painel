"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, catalogoAparenciaSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { normalizarSecoes } from "@/lib/vixe/vitrine";
import { z } from "zod";

/**
 * Aparência da vitrine (migração 0028). Arquivo separado de `actions.ts` (que é sobre o
 * catálogo em si — nome, slug, ativo) e de `pedidos-actions.ts` (atendimento de pedido):
 * este aqui é personalização visual, um terceiro domínio dentro da mesma tela.
 */

const uuid = z.string().uuid("Identificador inválido");

export interface AparenciaCatalogo {
  cor_primaria: string;
  cor_fundo: string;
  cor_superficie: string;
  cor_texto: string;
  fonte: "geist" | "inter" | "lora" | "poppins";
  logo_url: string | null;
  titulo: string | null;
  mensagem_boas_vindas: string | null;
}

const PADRAO: AparenciaCatalogo = {
  cor_primaria: "#3b4d1f",
  cor_fundo: "#fafafa",
  cor_superficie: "#ffffff",
  cor_texto: "#18181b",
  fonte: "geist",
  logo_url: null,
  titulo: null,
  mensagem_boas_vindas: null,
};

/** Lê a aparência salva, ou os valores padrão do sistema se o dono nunca personalizou. */
export async function obterAparenciaCatalogo(catalogoId: string) {
  return comResultado(async () => {
    const id = validar(uuid, catalogoId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalogo_aparencia")
      .select("cor_primaria, cor_fundo, cor_superficie, cor_texto, fonte, logo_url, titulo, mensagem_boas_vindas")
      .eq("catalogo_id", id)
      .maybeSingle<AparenciaCatalogo>();
    if (error) lancarErroSupabase(error);
    return data ?? PADRAO;
  });
}

export async function salvarAparenciaCatalogo(catalogoId: string, dados: AparenciaCatalogo) {
  return comResultado(async () => {
    const id = validar(uuid, catalogoId);
    const v = validar(catalogoAparenciaSchema, dados);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Entre de novo.");

    // `user_id` explícito: o trigger de FK cruzada (`validar_vinculo_do_dono`) confere que
    // `catalogo_id` aponta para um catálogo QUE ESTE USUÁRIO ENXERGA — se pertencer a outra
    // conta, o RLS de `catalogos` esconde a linha e o trigger recusa com exceção.
    const { error } = await supabase
      .from("catalogo_aparencia")
      .upsert({ catalogo_id: id, user_id: user.id, ...v, atualizado_em: new Date().toISOString() }, { onConflict: "catalogo_id" });
    if (error) lancarErroSupabase(error);
    revalidatePath("/catalogo");
  });
}


/**
 * Seções da vitrine (0040) editadas à mão em Catálogo › Personalizar. Passam pelo mesmo
 * portão da IA (`normalizarSecoes`): o cliente poderia mandar qualquer coisa.
 * Chamar depois de `salvarAparenciaCatalogo`, que garante a linha de aparência.
 */
export async function salvarSecoesCatalogo(catalogoId: string, secoes: unknown) {
  return comResultado(async () => {
    const id = validar(uuid, catalogoId);
    const s = normalizarSecoes(secoes);
    const supabase = await createClient();
    const { error } = await supabase
      .from("catalogo_aparencia")
      .update({ secoes: Object.keys(s).length ? s : null, atualizado_em: new Date().toISOString() })
      .eq("catalogo_id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/catalogo");
  });
}
