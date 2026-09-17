"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = "/configuracoes";

// ---------- Categorias ----------
export async function criarCategoria(nome: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categorias").insert({ nome });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function removerCategoria(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

// ---------- Lojas (dentro de um canal de venda) ----------
export interface LojaInput {
  canal_id: string;
  nome: string;
  logo_path: string | null;
  link: string | null;
  comissao_pct: number | null;
  taxa_fixa: number | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
}

export async function criarLoja(dados: LojaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("lojas_canal").insert(dados);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

export async function atualizarLoja(id: string, dados: LojaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("lojas_canal").update(dados).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

export async function removerLoja(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lojas_canal").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

// ---------- Contas ----------
export interface ContaInput {
  nome: string;
  saldo: number;
  detalhe: string;
}

export async function criarConta(dados: ContaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas").insert(dados);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

export async function atualizarConta(id: string, dados: ContaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas").update(dados).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

export async function removerConta(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

// ---------- Armazéns ----------
export interface ArmazemInput {
  nome: string;
  endereco: string;
  lojas_abastecidas: string[];
}

export async function criarArmazem(dados: ArmazemInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").insert(dados);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

export async function atualizarArmazem(id: string, dados: ArmazemInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").update(dados).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

export async function removerArmazem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

// ---------- Perfil do Negócio ----------
export interface PerfilNegocioInput {
  nome_negocio: string;
  cnpj: string;
  regime_tributario: string;
  aliquota_das: number;
}

export async function salvarPerfilNegocio(dados: PerfilNegocioInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada, faça login novamente");

  const { error } = await supabase
    .from("perfil_negocio")
    .upsert({ user_id: user.id, ...dados, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}
