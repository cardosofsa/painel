"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

/** Devolução e troca com estorno parcial (11.3). As regras moram na RPC `registrar_devolucao` (0059). */

export interface ItemDevolvivel {
  id: string;
  produtoNome: string;
  quantidade: number;
  devolvido: number;
  precoUnitario: number;
}

/** Itens da venda com quanto ainda dá para devolver. */
export async function itensParaDevolver(vendaId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const supabase = await createClient();
    const { data: itens, error } = await supabase.from("venda_itens").select("id, produto_nome, quantidade, preco_unitario").eq("venda_id", id);
    if (error) lancarErroSupabase(error);
    const ids = (itens ?? []).map((i) => i.id as string);
    const { data: dev, error: erroDev } = ids.length ? await supabase.from("devolucao_itens").select("venda_item_id, quantidade").in("venda_item_id", ids) : { data: [], error: null };
    if (erroDev?.code === "42P01" || erroDev?.code === "PGRST205") throw new Error("Devolução e troca precisam da migração 0059.");
    const ja = new Map<string, number>();
    for (const d of dev ?? []) ja.set(d.venda_item_id as string, (ja.get(d.venda_item_id as string) ?? 0) + Number(d.quantidade));
    return (itens ?? []).map(
      (i): ItemDevolvivel => ({ id: i.id as string, produtoNome: i.produto_nome as string, quantidade: Number(i.quantidade), devolvido: ja.get(i.id as string) ?? 0, precoUnitario: Number(i.preco_unitario) }),
    );
  });
}

const devolucaoSchema = z.object({
  vendaId: z.string().uuid(),
  itens: z.array(z.object({ venda_item_id: z.string().uuid(), quantidade: z.number().int().min(1).max(100_000), destino: z.enum(["estoque", "avaria"]) })).min(1).max(200),
  valorEstorno: z.number().finite().min(0).max(10_000_000),
  forma: z.enum(["reembolso", "abater", "troca", "nenhum"]),
  contaId: z.string().uuid().nullable(),
  motivo: z.string().trim().max(500).nullable(),
});

export async function registrarDevolucao(dados: z.input<typeof devolucaoSchema>) {
  return comResultado(async () => {
    const v = validar(devolucaoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("registrar_devolucao", {
      p_venda_id: v.vendaId,
      p_itens: v.itens,
      p_valor_estorno: v.valorEstorno,
      p_forma: v.forma,
      p_conta_id: v.contaId,
      p_motivo: v.motivo,
      p_tipo: v.forma === "troca" ? "troca" : "devolucao",
    });
    if (error?.code === "PGRST202") throw new Error("Devolução e troca precisam da migração 0059.");
    if (error) lancarErroSupabase(error);
    for (const p of ["/vendas", "/estoque", "/financeiro", "/dashboard", "/clientes", "/produtos"]) revalidatePath(p);
    return data as { numero: string; estorno: number };
  });
}
