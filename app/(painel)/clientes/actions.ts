"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, clienteSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { consultarCep } from "@/lib/cep-servidor";
import type { EnderecoCep } from "@/lib/cep";

/** Preenche o endereço a partir do CEP. `null` = não achou; a tela deixa digitar à mão. */
export async function buscarCep(cep: string) {
  return comResultado(async (): Promise<EnderecoCep | null> => {
    // Exige sessão: sem isso a action viraria um proxy aberto para o ViaCEP.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return consultarCep(cep);
  });
}

export interface ClienteInput {
  nome: string;
  whatsapp: string | null;
  email: string | null;
  documento: string | null;
  data_nascimento: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cidade: string | null;
  uf: string | null;
  observacao: string | null;
  permite_fiado: boolean;
  limite_fiado: number;
  status: "ativo" | "inativo";
}

function revalidateTudo() {
  revalidatePath("/clientes");
  revalidatePath("/pdv");
  revalidatePath("/vendas");
}

export async function criarCliente(dados: ClienteInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("clientes").insert(validar(clienteSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

/** Cadastro rápido feito de dentro do PDV: devolve o cliente pra já sair selecionado. */
export async function criarClienteRapido(nome: string, whatsapp: string | null, permiteFiado: boolean) {
  return comResultado(async () => {
    const supabase = await createClient();
    const dados = validar(clienteSchema, {
      nome,
      whatsapp,
      email: null,
      documento: null,
      data_nascimento: null,
      cep: null,
      endereco: null,
      numero: null,
      bairro: null,
      complemento: null,
      cidade: null,
      uf: null,
      observacao: null,
      permite_fiado: permiteFiado,
      limite_fiado: 0,
      status: "ativo" as const,
    });

    const { data, error } = await supabase.from("clientes").insert(dados).select("id, nome, permite_fiado").single();
    if (error || !data) lancarErroSupabase(error ?? { message: "Erro ao cadastrar cliente" });

    revalidateTudo();
    return data;
  });
}

export async function atualizarCliente(id: string, dados: ClienteInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("clientes").update(validar(clienteSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function removerCliente(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();

    // Venda guarda cliente_id com on delete set null, então o delete passaria e o
    // histórico perderia o vínculo em silêncio. Melhor barrar e sugerir desativar.
    const { count, error: erroVendas } = await supabase
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", id);
    if (erroVendas) lancarErroSupabase(erroVendas);

    if ((count ?? 0) > 0) {
      throw new Error(
        `Esse cliente tem ${count} venda(s) registrada(s) e não pode ser removido. Desative-o para tirá-lo da lista sem perder o histórico.`,
      );
    }

    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

/**
 * Junta o cadastro duplicado no original (0043): vendas e pedidos passam para o que fica,
 * os campos vazios dele são completados e o duplicado é apagado.
 */
export async function mesclarClientes(manterId: string, removerId: string) {
  return comResultado(async () => {
    const ids = validar(z.object({ manter: z.string().uuid(), remover: z.string().uuid() }), { manter: manterId, remover: removerId });
    const supabase = await createClient();
    const { error } = await supabase.rpc("mesclar_clientes", { p_manter: ids.manter, p_remover: ids.remover });
    if (error) lancarErroSupabase(error);
    revalidatePath("/clientes");
    revalidatePath("/vendas");
  });
}

/** "Não é a mesma pessoa": tira o aviso de possível duplicado. */
export async function ignorarDuplicado(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const supabase = await createClient();
    const { error } = await supabase.from("clientes").update({ possivel_duplicado_de: null }).eq("id", v);
    if (error) lancarErroSupabase(error);
    revalidatePath("/clientes");
  });
}

export async function alternarStatusCliente(id: string, statusAtual: "ativo" | "inativo") {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clientes")
      .update({ status: statusAtual === "ativo" ? "inativo" : "ativo" })
      .eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}
