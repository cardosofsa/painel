"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
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
}
