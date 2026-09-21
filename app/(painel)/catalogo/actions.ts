"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, catalogoSchema, precoOverrideSchema } from "@/lib/validacao";

const PATH = "/catalogo";

export interface CatalogoInput {
  nome: string;
}

export interface ProdutoPrecoCatalogo {
  produto_id: string;
  produto_nome: string;
  preco_venda: number;
  preco_override: number | null;
}

function gerarSlug() {
  return randomBytes(6).toString("base64url");
}

export async function criarCatalogo(dados: CatalogoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").insert({ ...validar(catalogoSchema, dados), slug: gerarSlug() });
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

export async function atualizarCatalogo(id: string, dados: CatalogoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").update(validar(catalogoSchema, dados)).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

export async function alternarAtivoCatalogo(id: string, ativoAtual: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").update({ ativo: !ativoAtual }).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

export async function regenerarLinkCatalogo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").update({ slug: gerarSlug() }).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

export async function removerCatalogo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

/** Produtos elegíveis (ativos + com estoque) e o preço que cada um mostra nesse catálogo. */
export async function listarPrecosCatalogo(catalogoId: string): Promise<ProdutoPrecoCatalogo[]> {
  const supabase = await createClient();

  const [produtosRes, overridesRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, preco_venda").eq("ativo", true).gt("estoque", 0).order("nome"),
    supabase.from("catalogo_precos").select("produto_id, preco").eq("catalogo_id", catalogoId),
  ]);
  if (produtosRes.error) lancarErroSupabase(produtosRes.error);
  if (overridesRes.error) lancarErroSupabase(overridesRes.error);

  const overridePorProduto = new Map((overridesRes.data ?? []).map((o) => [o.produto_id, o.preco]));

  return (produtosRes.data ?? []).map((p) => ({
    produto_id: p.id,
    produto_nome: p.nome,
    preco_venda: p.preco_venda,
    preco_override: overridePorProduto.get(p.id) ?? null,
  }));
}

export async function salvarPrecosCatalogo(catalogoId: string, itens: { produto_id: string; preco: number | null }[]) {
  const supabase = await createClient();
  const validados = itens.map((item) => validar(precoOverrideSchema, item));

  const semOverride = validados.filter((i) => i.preco === null).map((i) => i.produto_id);
  const comOverride = validados.filter((i): i is { produto_id: string; preco: number } => i.preco !== null);

  if (semOverride.length > 0) {
    const { error } = await supabase
      .from("catalogo_precos")
      .delete()
      .eq("catalogo_id", catalogoId)
      .in("produto_id", semOverride);
    if (error) lancarErroSupabase(error);
  }

  if (comOverride.length > 0) {
    const linhas = comOverride.map((i) => ({ catalogo_id: catalogoId, produto_id: i.produto_id, preco: i.preco }));
    const { error } = await supabase.from("catalogo_precos").upsert(linhas, { onConflict: "catalogo_id,produto_id" });
    if (error) lancarErroSupabase(error);
  }

  revalidatePath(PATH);
}
