"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  produtoSchema,
  grupoProdutoSchema,
  imagemProdutoSchema,
  acaoEmMassaProdutosSchema,
} from "@/lib/validacao";
import { gerarComIA } from "@/lib/ia/gerar";
import { comResultado } from "@/lib/acao";
import type { ComponenteKit } from "@/lib/pricing";

const PATH = "/produtos";

export interface ProdutoInput {
  sku: string;
  nome: string;
  categoria_id: string | null;
  fornecedor_id: string | null;
  armazem_id: string | null;
  /** Valor do produto — junto com `insumos`, compõe `produtos.custo` (derivado por
   * trigger desde a 0029; nunca é mandado direto pro banco). */
  custo_base: number;
  insumos: ComponenteKit[];
  preco_venda: number;
  descricao: string | null;
  codigo_barras: string | null;
  imagem_url: string | null;
  estoque: number;
  estoque_minimo: number;
  saida_media_semanal: number;
  ativo: boolean;
  grupo_id: string | null;
  variante_nome: string | null;
  loja_ids: string[];
}

function revalidateTudo() {
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  revalidatePath("/precificacao");
  revalidatePath("/compras");
  revalidatePath("/pdv");
  revalidatePath("/catalogo");
}

/** Grupo de variantes: só o nome comercial compartilhado. Estoque/preço/SKU seguem no produto. */
export async function criarGrupoProduto(nome: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("produto_grupos")
      .insert(validar(grupoProdutoSchema, { nome, descricao: null, imagem_url: null, categoria_id: null }))
      .select("id, nome")
      .single();
    if (error || !data) lancarErroSupabase(error ?? { message: "Erro ao criar grupo" });
    revalidateTudo();
    return data;
  });
}

async function sincronizarLojasProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaIds: string[],
) {
  const { error: erroDelete } = await supabase.from("produto_lojas").delete().eq("produto_id", produtoId);
  if (erroDelete) lancarErroSupabase(erroDelete);

  if (lojaIds.length > 0) {
    const linhas = lojaIds.map((loja_id) => ({ produto_id: produtoId, loja_id }));
    const { error: erroInsert } = await supabase.from("produto_lojas").insert(linhas);
    if (erroInsert) lancarErroSupabase(erroInsert);
  }
}

export async function criarProduto(dados: ProdutoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { loja_ids, ...produto } = validar(produtoSchema, dados);
    const { data, error } = await supabase.from("produtos").insert(produto).select("id").single();
    if (error) lancarErroSupabase(error);
    if (!data) throw new Error("Erro ao criar produto.");
    await sincronizarLojasProduto(supabase, data.id, loja_ids);
    revalidateTudo();
  });
}

export async function atualizarProduto(id: string, dados: ProdutoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { loja_ids, ...produto } = validar(produtoSchema, dados);
    const { error } = await supabase.from("produtos").update(produto).eq("id", id);
    if (error) lancarErroSupabase(error);
    await sincronizarLojasProduto(supabase, id, loja_ids);
    revalidateTudo();
  });
}

export async function removerProduto(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function alternarAtivoProduto(id: string, ativoAtual: boolean) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produtos").update({ ativo: !ativoAtual }).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function acaoEmMassaProdutos(ids: string[], acao: "ativar" | "desativar" | "remover") {
  return comResultado(async () => {
    const v = validar(acaoEmMassaProdutosSchema, { ids, acao });
    const supabase = await createClient();
    if (v.acao === "remover") {
      const { error } = await supabase.from("produtos").delete().in("id", v.ids);
      if (error) lancarErroSupabase(error);
    } else {
      const { error } = await supabase.from("produtos").update({ ativo: v.acao === "ativar" }).in("id", v.ids);
      if (error) lancarErroSupabase(error);
    }
    revalidateTudo();
  });
}

export async function adicionarImagemProduto(produtoId: string, url: string) {
  return comResultado(async () => {
    const v = validar(imagemProdutoSchema, { produto_id: produtoId, url });
    const supabase = await createClient();
    const { error } = await supabase.from("produto_imagens").insert({ produto_id: v.produto_id, url: v.url });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function removerImagemProduto(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produto_imagens").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

/**
 * Gera descrição de produto com IA.
 *
 * NÃO revalida: nada é gravado aqui. O texto só vira `produtos.descricao` quando o
 * usuário aprovar no painel e salvar o formulário — o que importa porque essa coluna é
 * exibida na vitrine pública.
 */
export async function gerarDescricaoProdutoIA(contexto: unknown) {
  const supabase = await createClient();
  return gerarComIA(supabase, "descricao", contexto);
}
