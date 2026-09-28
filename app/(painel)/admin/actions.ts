"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase, traduzirErroSupabase } from "@/lib/erros";
import { normalizarAbas, type StatusConta } from "@/lib/acesso";

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
}

/**
 * Aprova/suspende várias contas numa chamada só, em vez de uma RPC por conta — o mesmo
 * raciocínio que corrigiu o N+1 da calculadora em massa: menos idas ao banco, e as linhas
 * de histórico saem todas na mesma transação.
 */
export async function atualizarStatusEmLote(userIds: string[], status: StatusConta) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_atualizar_status_lote", {
    p_user_ids: userIds,
    p_status: status,
  });
  if (error) lancarErroSupabase(error);

  revalidatePath("/admin");
}

/**
 * Cota diária de gerações por IA da conta. Quem confere `e_master()` e valida o intervalo
 * é a RPC, no banco.
 *
 * Diferente das duas actions acima, **devolve** o erro em vez de lançar: exceção de Server
 * Action é redigida pelo Next em produção, e a mensagem em pt-BR da RPC ("Só a conta
 * master pode alterar a cota de IA", "Cota fora do intervalo permitido") não chegaria à
 * tela. Mesmo motivo de `lib/ia/gerar.ts` e de `app/auth/actions.ts`.
 */
export async function definirLimiteIaConta(
  userId: string,
  limite: number,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_definir_limite_ia", {
    p_user_id: userId,
    p_limite: limite,
  });
  if (error) return { ok: false, erro: traduzirErroSupabase(error) };

  revalidatePath("/admin");
  revalidatePath(`/admin/${userId}`);
  return { ok: true };
}
