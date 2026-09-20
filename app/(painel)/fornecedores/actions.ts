"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";

export interface FornecedorInput {
  nome: string;
  cnpj: string;
  contato: string;
  telefone: string;
  cidade: string;
  prazo: string;
  status: "ativo" | "inativo";
}

export async function criarFornecedor(dados: FornecedorInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").insert(dados);
  if (error) lancarErroSupabase(error);
  revalidatePath("/fornecedores");
}

export async function atualizarFornecedor(id: string, dados: FornecedorInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").update(dados).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/fornecedores");
}

export async function removerFornecedor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/fornecedores");
}

export async function alternarStatusFornecedor(id: string, statusAtual: "ativo" | "inativo") {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fornecedores")
    .update({ status: statusAtual === "ativo" ? "inativo" : "ativo" })
    .eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/fornecedores");
}
