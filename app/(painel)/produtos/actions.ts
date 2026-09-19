"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = "/produtos";

export interface ProdutoInput {
  sku: string;
  nome: string;
  categoria_id: string | null;
  fornecedor_id: string | null;
  armazem_id: string | null;
  custo: number;
  preco_venda: number;
  preco_atacado: number | null;
  codigo_barras: string | null;
  imagem_url: string | null;
  estoque: number;
  estoque_minimo: number;
  saida_media_semanal: number;
  ativo: boolean;
  loja_ids: string[];
}

function revalidateTudo() {
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  revalidatePath("/precificacao");
  revalidatePath("/compras");
}

async function sincronizarLojasProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaIds: string[],
) {
  const { error: erroDelete } = await supabase.from("produto_lojas").delete().eq("produto_id", produtoId);
  if (erroDelete) throw new Error(erroDelete.message);

  if (lojaIds.length > 0) {
    const linhas = lojaIds.map((loja_id) => ({ produto_id: produtoId, loja_id }));
    const { error: erroInsert } = await supabase.from("produto_lojas").insert(linhas);
    if (erroInsert) throw new Error(erroInsert.message);
  }
}

export async function criarProduto(dados: ProdutoInput) {
  const supabase = await createClient();
  const { loja_ids, ...produto } = dados;
  const { data, error } = await supabase.from("produtos").insert(produto).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Erro ao criar produto");
  await sincronizarLojasProduto(supabase, data.id, loja_ids);
  revalidateTudo();
}

export async function atualizarProduto(id: string, dados: ProdutoInput) {
  const supabase = await createClient();
  const { loja_ids, ...produto } = dados;
  const { error } = await supabase.from("produtos").update(produto).eq("id", id);
  if (error) throw new Error(error.message);
  await sincronizarLojasProduto(supabase, id, loja_ids);
  revalidateTudo();
}

export async function removerProduto(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTudo();
}

export async function alternarAtivoProduto(id: string, ativoAtual: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ ativo: !ativoAtual }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTudo();
}

export async function acaoEmMassaProdutos(ids: string[], acao: "ativar" | "desativar" | "remover") {
  const supabase = await createClient();
  if (acao === "remover") {
    const { error } = await supabase.from("produtos").delete().in("id", ids);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("produtos").update({ ativo: acao === "ativar" }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  revalidateTudo();
}
