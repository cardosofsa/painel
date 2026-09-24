"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  lojaSchema,
  canalSchema,
  faixaComissaoSchema,
  contaSchema,
  armazemSchema,
  formaPagamentoSchema,
  perfilNegocioSchema,
} from "@/lib/validacao";

const PATH = "/configuracoes";

// ---------- Categorias ----------
export async function criarCategoria(nome: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categorias").insert({ nome });
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
}

export async function removerCategoria(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
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
  const { error } = await supabase.from("lojas_canal").insert(validar(lojaSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

export async function atualizarLoja(id: string, dados: LojaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("lojas_canal").update(validar(lojaSchema, dados)).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

export async function removerLoja(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lojas_canal").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

// ---------- Canais (categorias fixas de venda: Shopee, Mercado Livre, etc.) ----------
export interface CanalInput {
  nome: string;
  tipo_taxa: "faixas" | "fixo";
  icone: string;
  cor: string;
}

export async function criarCanal(dados: CanalInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("canais").insert(validar(canalSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

export async function removerCanal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("canais").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
  revalidatePath("/produtos");
}

const CANAIS_PADRAO: CanalInput[] = [
  { nome: "Shopee", tipo_taxa: "faixas", icone: "ShoppingBag", cor: "#EE4D2D" },
  { nome: "Mercado Livre", tipo_taxa: "fixo", icone: "ShoppingCart", cor: "#FFE600" },
  { nome: "Loja Física", tipo_taxa: "fixo", icone: "Store", cor: "#64748b" },
  { nome: "Facebook", tipo_taxa: "fixo", icone: "Facebook", cor: "#1877F2" },
];

export async function restaurarCanaisPadrao() {
  const supabase = await createClient();
  const { data: existentes, error: erroSelect } = await supabase.from("canais").select("nome");
  if (erroSelect) lancarErroSupabase(erroSelect);

  const nomesExistentes = new Set((existentes ?? []).map((c) => c.nome));
  const faltando = CANAIS_PADRAO.filter((c) => !nomesExistentes.has(c.nome));
  if (faltando.length === 0) return;

  const { error } = await supabase.from("canais").insert(faltando);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}

// ---------- Faixas de comissão por canal (ex.: tabela oficial da Shopee) ----------
export interface FaixaComissaoInput {
  preco_min: number;
  preco_max: number | null;
  comissao_pct: number;
  tarifa_fixa: number;
}

export async function atualizarFaixasCanal(canalId: string, faixas: FaixaComissaoInput[]) {
  const supabase = await createClient();
  const { error: erroDelete } = await supabase.from("faixas_comissao_canal").delete().eq("canal_id", canalId);
  if (erroDelete) lancarErroSupabase(erroDelete);

  if (faixas.length > 0) {
    const linhas = faixas.map((f, i) => ({ canal_id: canalId, ordem: i + 1, ...validar(faixaComissaoSchema, f) }));
    const { error: erroInsert } = await supabase.from("faixas_comissao_canal").insert(linhas);
    if (erroInsert) lancarErroSupabase(erroInsert);
  }

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
  const { error } = await supabase.from("contas").insert(validar(contaSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

export async function atualizarConta(id: string, dados: ContaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas").update(validar(contaSchema, dados)).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

export async function removerConta(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

// ---------- Formas de Pagamento ----------
export interface FormaPagamentoInput {
  nome: string;
}

export async function criarFormaPagamento(dados: FormaPagamentoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("formas_pagamento").insert(validar(formaPagamentoSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/compras");
}

export async function atualizarFormaPagamento(id: string, dados: FormaPagamentoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("formas_pagamento").update(validar(formaPagamentoSchema, dados)).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/compras");
}

export async function removerFormaPagamento(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("formas_pagamento").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/compras");
}

// ---------- Armazéns ----------
export interface ArmazemInput {
  nome: string;
  endereco: string;
  lojas_abastecidas: string[];
}

export async function criarArmazem(dados: ArmazemInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").insert(validar(armazemSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

export async function atualizarArmazem(id: string, dados: ArmazemInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").update(validar(armazemSchema, dados)).eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

export async function removerArmazem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("armazens").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
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
  whatsapp: string | null;
  pin_admin: string | null;
}

export async function salvarPerfilNegocio(dados: PerfilNegocioInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada, faça login novamente");

  const { error } = await supabase
    .from("perfil_negocio")
    .upsert({ user_id: user.id, ...validar(perfilNegocioSchema, dados), atualizado_em: new Date().toISOString() });
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/precificacao");
}
