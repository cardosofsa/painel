"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

/**
 * Master: plano de cada conta e catálogo de planos (10.9). Quem confere `e_master()` é o
 * banco (RPC e policies da 0057); aqui só valida e repassa.
 */

const assinaturaSchema = z.object({
  user_id: z.string().uuid(),
  plano_id: z.string().regex(/^[a-z0-9_-]{2,30}$/),
  status: z.enum(["teste", "ativa", "atrasada", "cancelada"]),
  periodo_fim: z.string().datetime({ offset: true }).nullable(),
  teste_ate: z.string().datetime({ offset: true }).nullable(),
  observacao: z.string().trim().max(300).nullable(),
});

export async function definirAssinaturaConta(dados: z.input<typeof assinaturaSchema>) {
  return comResultado(async () => {
    const v = validar(assinaturaSchema, dados);
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_definir_assinatura", {
      p_user: v.user_id,
      p_plano: v.plano_id,
      p_status: v.status,
      p_periodo_fim: v.periodo_fim,
      p_teste_ate: v.teste_ate,
      p_observacao: v.observacao,
    });
    if (error) lancarErroSupabase(error);
    revalidatePath("/admin");
    revalidatePath(`/admin/${v.user_id}`);
  });
}

const limite = z.number().int().min(0).max(10_000_000).nullable();
const planoSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{2,30}$/, "Id: só letras minúsculas, números, - e _."),
  nome: z.string().trim().min(1).max(40),
  descricao: z.string().trim().max(300).nullable(),
  preco_mensal: z.number().finite().min(0).max(100_000),
  limite_produtos: limite,
  limite_lojas: limite,
  limite_usuarios: z.number().int().min(1).max(10_000).nullable(),
  limite_ia_mes: limite,
  ativo: z.boolean(),
  ordem: z.number().int().min(0).max(100),
});

export async function salvarPlano(dados: z.input<typeof planoSchema>) {
  return comResultado(async () => {
    const v = validar(planoSchema, dados);
    const supabase = await createClient();
    const { error } = await supabase.from("planos").upsert({ ...v, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/admin");
  });
}
