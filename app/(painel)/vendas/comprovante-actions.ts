"use server";

import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { carregarComprovante } from "@/lib/comprovante-servidor";
import type { DadosComprovante } from "@/lib/comprovante";

/** Dados completos do comprovante de uma venda (empresa, cliente, garantia, parcelas). */
export async function obterComprovante(vendaId: string) {
  return comResultado(async (): Promise<DadosComprovante> => {
    if (!/^[0-9a-f-]{36}$/i.test(vendaId)) throw new Error("Venda inválida.");
    const supabase = await createClient();
    const dados = await carregarComprovante(supabase, vendaId);
    if (!dados) throw new Error("Venda não encontrada.");
    return dados;
  });
}
