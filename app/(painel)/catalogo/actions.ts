"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, catalogoSchema } from "@/lib/validacao";

const PATH = "/catalogo";

export interface CatalogoInput {
  nome: string;
  tipo_preco: "venda" | "atacado";
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
