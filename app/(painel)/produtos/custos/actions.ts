"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { custoAvulsoSchema, importarCustosSchema, validar } from "@/lib/validacao";
import { chaveNome, type CustoAvulso } from "@/lib/custos-avulsos";

const SEM_0112 = "Os custos avulsos precisam da migração 0112. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01";

function checar(erro: { message: string; code?: string } | null) {
  if (!erro) return;
  if (faltaMigracao(erro.code)) throw new Error(SEM_0112);
  // Índice único por nome (sem diferenciar maiúscula).
  if (erro.code === "23505") throw new Error("Já existe um custo com esse nome. Edite o que já está na lista.");
  lancarErroSupabase(erro);
}

function revalidar() {
  revalidatePath("/produtos/custos");
  revalidatePath("/precificacao");
}

/** Cria ou edita um custo (um por um). */
export async function salvarCustoAvulso(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string }> => {
    const v = validar(custoAvulsoSchema, entrada);
    const supabase = await createClient();
    const dados = { nome: v.nome.replace(/\s+/g, " "), unidade: v.unidade, custo: v.custo, grupo: v.grupo, observacao: v.observacao };
    const r = v.id ? await supabase.from("custos_avulsos").update(dados).eq("id", v.id).select("id").single() : await supabase.from("custos_avulsos").insert(dados).select("id").single();
    checar(r.error);
    revalidar();
    return { id: r.data!.id as string };
  });
}

export async function alternarCustoAvulso(id: string, ativo: boolean) {
  return comResultado(async () => {
    const v = validar(z.object({ id: z.string().uuid(), ativo: z.boolean() }), { id, ativo });
    const supabase = await createClient();
    const { error } = await supabase.from("custos_avulsos").update({ ativo: v.ativo }).eq("id", v.id);
    checar(error);
    revalidar();
  });
}

export async function removerCustoAvulso(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const supabase = await createClient();
    const { error } = await supabase.from("custos_avulsos").delete().eq("id", v);
    checar(error);
    revalidar();
  });
}

/**
 * Lista colada ou planilha, já conferida na tela: nome novo entra, nome que já existe tem o
 * custo (e a unidade, o grupo e a observação, se vierem) atualizado. A comparação é refeita
 * aqui com o que está no banco agora, não com o que a tela viu.
 */
export async function importarCustosAvulsos(entrada: unknown) {
  return comResultado(async (): Promise<{ novos: number; atualizados: number; iguais: number }> => {
    const v = validar(importarCustosSchema, entrada);
    const supabase = await createClient();
    const { data: atuais, error } = await supabase.from("custos_avulsos").select("id, nome, unidade, custo, grupo, observacao");
    checar(error);
    const porNome = new Map(((atuais ?? []) as Pick<CustoAvulso, "id" | "nome" | "unidade" | "custo" | "grupo" | "observacao">[]).map((c) => [chaveNome(c.nome), c]));

    const unicas = new Map(v.linhas.map((l) => [chaveNome(l.nome), l]));
    const novos: Record<string, unknown>[] = [];
    let atualizados = 0;
    let iguais = 0;
    for (const l of unicas.values()) {
      const atual = porNome.get(chaveNome(l.nome));
      if (!atual) {
        novos.push({ nome: l.nome.replace(/\s+/g, " "), unidade: l.unidade, custo: l.custo, grupo: l.grupo, observacao: l.observacao });
        continue;
      }
      const mudanca = {
        custo: l.custo,
        unidade: l.unidade,
        ...(l.grupo ? { grupo: l.grupo } : {}),
        ...(l.observacao ? { observacao: l.observacao } : {}),
      };
      const igual = Math.abs(Number(atual.custo) - l.custo) < 0.00005 && atual.unidade === l.unidade && (!l.grupo || l.grupo === atual.grupo) && (!l.observacao || l.observacao === atual.observacao);
      if (igual) {
        iguais++;
        continue;
      }
      const { error: erroAtualizar } = await supabase.from("custos_avulsos").update(mudanca).eq("id", atual.id);
      checar(erroAtualizar);
      atualizados++;
    }
    if (novos.length) {
      const { error: erroInserir } = await supabase.from("custos_avulsos").insert(novos);
      checar(erroInserir);
    }
    revalidar();
    return { novos: novos.length, atualizados, iguais };
  });
}

/**
 * Os custos ativos, para o pop-up "Custo" da Precificação (Individual, Variações e Kits).
 * Lido na hora de abrir: assim a lista está sempre como em "Registrar custo".
 */
export async function listarCustosAvulsos() {
  return comResultado(async (): Promise<CustoAvulso[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("custos_avulsos").select("id, nome, unidade, custo, grupo, observacao, ativo, atualizado_em").eq("ativo", true).order("nome").limit(2000);
    checar(error);
    return ((data ?? []) as CustoAvulso[]).map((c) => ({ ...c, custo: Number(c.custo) }));
  });
}
