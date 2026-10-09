"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, variacaoEdicaoSchema } from "@/lib/validacao";
import type { ComponenteKit } from "@/lib/pricing";

export interface VariacaoEdicaoInput {
  id: string;
  variante_nome: string;
  sku: string;
  preco_venda: number;
  custo_manual: number | null;
  insumos_variacao: ComponenteKit[];
  peso_g: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  comprimento_cm: number | null;
}

/**
 * Edita UMA variação por quantidade: nome, SKU, preço, custo próprio, composição extra
 * (embalagem etc., 0094) e medidas de envio. Estoque e custo calculado continuam do banco
 * (pai × N + composição extra). A trava é o RLS de `produtos` e o `produto_pai_id is not null`.
 */
export async function atualizarVariacao(dados: VariacaoEdicaoInput) {
  return comResultado(async () => {
    const v = validar(variacaoEdicaoSchema, dados);
    const supabase = await createClient();
    const { id, ...campos } = v;
    const { data, error } = await supabase.from("produtos").update(campos).eq("id", id).not("produto_pai_id", "is", null).select("id");
    if (error) {
      if (error.code === "PGRST204" || error.code === "42703") throw new Error("Editar a composição da variação precisa da migração 0094. Aplique no Supabase e tente de novo.");
      lancarErroSupabase(error);
    }
    if (!data?.length) throw new Error("Variação não encontrada. Atualize a página.");
    for (const p of ["/produtos", "/estoque", "/precificacao", "/compras", "/vendas"]) revalidatePath(p);
  });
}
