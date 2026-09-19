"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ComponenteKit } from "@/lib/pricing";

export interface PrecificacaoInput {
  produto_id: string | null;
  produto_nome: string;
  canal: string | null;
  titulo_anuncio: string | null;
  loja_id: string | null;
  componentes: ComponenteKit[] | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
  origem: "individual" | "em_massa";
}

export async function salvarPrecificacao(dados: PrecificacaoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("precificacoes").insert(dados);
  if (error) throw new Error(error.message);
  revalidatePath("/precificacao");
  revalidatePath("/produtos");
}

export async function removerPrecificacao(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("precificacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/precificacao");
}

export async function atualizarPrecoProduto(produtoId: string, precoVenda: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ preco_venda: precoVenda }).eq("id", produtoId);
  if (error) throw new Error(error.message);
  revalidatePath("/produtos");
  revalidatePath("/precificacao");
  revalidatePath("/dashboard");
}

// ---------- Anúncio com Variações ----------
export interface VariacaoInput {
  nome_variacao: string;
  multiplicador: number;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
}

export interface AnuncioInput {
  produto_id: string | null;
  loja_id: string | null;
  nome_anuncio: string;
  titulo_anuncio: string | null;
  componentes_base: ComponenteKit[] | null;
  variacoes: VariacaoInput[];
}

export async function criarAnuncio(dados: AnuncioInput) {
  const supabase = await createClient();
  const { data: anuncio, error } = await supabase
    .from("anuncios")
    .insert({
      produto_id: dados.produto_id,
      loja_id: dados.loja_id,
      nome_anuncio: dados.nome_anuncio,
      titulo_anuncio: dados.titulo_anuncio,
      componentes_base: dados.componentes_base,
    })
    .select("id")
    .single();
  if (error || !anuncio) throw new Error(error?.message ?? "Erro ao criar anúncio");

  const variacoes = dados.variacoes.map((v) => ({ ...v, anuncio_id: anuncio.id }));
  const { error: erroVariacoes } = await supabase.from("anuncio_variacoes").insert(variacoes);
  if (erroVariacoes) throw new Error(erroVariacoes.message);

  revalidatePath("/precificacao");
}

export async function removerAnuncio(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("anuncios").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/precificacao");
}

// ---------- Preços dos Concorrentes ----------
export interface ConcorrenteInput {
  nome: string;
  preco: number;
  link: string | null;
}

export async function criarConcorrente(produtoId: string, dados: ConcorrenteInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("concorrentes_preco")
    .insert({ produto_id: produtoId, nome: dados.nome, preco: dados.preco, link: dados.link })
    .select("id, nome, preco, link")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Erro ao salvar concorrente");
  revalidatePath("/precificacao");
  return data;
}

export async function removerConcorrenteSalvo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("concorrentes_preco").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/precificacao");
}
