"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { normalizarAbas, type StatusConta } from "@/lib/acesso";
import { comResultado } from "@/lib/acao";

export interface AcessoInput {
  user_id: string;
  status: StatusConta;
  abas: string[];
  observacao: string | null;
  expira_em: string | null;
}

/**
 * Quem confere se o autor é master é a própria RPC (`admin_atualizar_conta`), no banco —
 * não dá pra confiar numa checagem só no servidor do app, porque a chave anônima permite
 * chamar a RPC direto. Aqui só normaliza a entrada e repassa.
 */
export async function atualizarAcessoConta(dados: AcessoInput) {
  return comResultado(async () => {
    const supabase = await createClient();

    const { error } = await supabase.rpc("admin_atualizar_conta", {
      p_user_id: dados.user_id,
      p_status: dados.status,
      p_abas: normalizarAbas(dados.abas),
      p_observacao: dados.observacao,
      p_expira_em: dados.expira_em,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/admin");
    revalidatePath(`/admin/${dados.user_id}`);
  });
}

/**
 * Aprova/suspende várias contas numa chamada só, em vez de uma RPC por conta — o mesmo
 * raciocínio que corrigiu o N+1 da calculadora em massa: menos idas ao banco, e as linhas
 * de histórico saem todas na mesma transação.
 */
export async function atualizarStatusEmLote(userIds: string[], status: StatusConta) {
  return comResultado(async () => {
    const supabase = await createClient();

    const { error } = await supabase.rpc("admin_atualizar_status_lote", {
      p_user_ids: userIds,
      p_status: status,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/admin");
  });
}

/**
 * Teste grátis da IA do sistema para uma conta: por quantos dias e quantas gerações no total
 * (migração 0036). `reiniciar` zera o consumo e faz a janela recomeçar na próxima geração.
 * Quem confere `e_master()` e valida os intervalos é a RPC, no banco.
 */
export async function definirTesteIaConta(userId: string, dias: number, limite: number, reiniciar: boolean) {
  return comResultado(async () => {
    const supabase = await createClient();

    const { error } = await supabase.rpc("admin_definir_teste_ia", {
      p_user_id: userId,
      p_dias: dias,
      p_limite: limite,
      p_reiniciar: reiniciar,
    });
    if (error) lancarErroSupabase(error);

    revalidatePath("/admin");
    revalidatePath(`/admin/${userId}`);
  });
}
