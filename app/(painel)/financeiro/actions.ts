"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function revalidateTudo() {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
}

async function ajustarSaldoConta(supabase: SupabaseClient, contaId: string, delta: number) {
  const { error } = await supabase.rpc("ajustar_saldo_conta", { p_conta_id: contaId, p_delta: delta });
  if (error) throw new Error(error.message);
}

// ---------- Lançamentos ----------
export interface MovimentacaoInput {
  tipo: "entrada" | "saida";
  valor: number;
  descricao: string;
  origem: string | null;
  categoria: string | null;
  conta_id: string;
  afeta_lucro: boolean;
  data_movimentacao: string;
}

export async function criarMovimentacao(dados: MovimentacaoInput) {
  const supabase = await createClient();
  const valorComSinal = dados.tipo === "entrada" ? Math.abs(dados.valor) : -Math.abs(dados.valor);

  const { error } = await supabase.from("movimentacoes_financeiras").insert({
    tipo: dados.tipo,
    valor: valorComSinal,
    descricao: dados.descricao,
    origem: dados.origem,
    categoria: dados.categoria,
    conta_id: dados.conta_id,
    afeta_lucro: dados.afeta_lucro,
    data_movimentacao: dados.data_movimentacao,
  });
  if (error) throw new Error(error.message);

  await ajustarSaldoConta(supabase, dados.conta_id, valorComSinal);
  revalidateTudo();
}

// ---------- Despesas fixas ----------
export interface DespesaFixaInput {
  nome: string;
  metodo: string | null;
  valor: number;
  dia_vencimento: number;
  conta_id: string | null;
}

export async function criarDespesaFixa(dados: DespesaFixaInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("despesas_fixas").insert(dados);
  if (error) throw new Error(error.message);
  revalidateTudo();
}

export async function retirarDespesaDaConta(despesaId: string) {
  const supabase = await createClient();
  const { data: despesa, error } = await supabase
    .from("despesas_fixas")
    .select("id, nome, valor, conta_id")
    .eq("id", despesaId)
    .single();
  if (error || !despesa) throw new Error(error?.message ?? "Despesa não encontrada");
  if (!despesa.conta_id) throw new Error("Essa despesa não tem conta vinculada");

  const { error: erroInsert } = await supabase.from("movimentacoes_financeiras").insert({
    tipo: "saida",
    valor: -despesa.valor,
    descricao: despesa.nome,
    origem: "Despesa fixa",
    categoria: "Despesas fixas",
    conta_id: despesa.conta_id,
    afeta_lucro: true,
    referencia_despesa_fixa_id: despesa.id,
    data_movimentacao: new Date().toISOString().slice(0, 10),
  });
  if (erroInsert) throw new Error(erroInsert.message);

  await ajustarSaldoConta(supabase, despesa.conta_id, -despesa.valor);
  revalidateTudo();
}

export async function desfazerRetiradaDespesa(movimentacaoId: string) {
  const supabase = await createClient();
  const { data: mov, error } = await supabase
    .from("movimentacoes_financeiras")
    .select("id, valor, conta_id")
    .eq("id", movimentacaoId)
    .single();
  if (error || !mov) throw new Error(error?.message ?? "Movimentação não encontrada");

  const { error: erroDelete } = await supabase.from("movimentacoes_financeiras").delete().eq("id", movimentacaoId);
  if (erroDelete) throw new Error(erroDelete.message);

  if (mov.conta_id) await ajustarSaldoConta(supabase, mov.conta_id, -mov.valor);
  revalidateTudo();
}

// ---------- Contas a pagar / receber ----------
export async function quitarContaPagarReceber(id: string) {
  const supabase = await createClient();
  const { data: cpr, error } = await supabase
    .from("contas_a_pagar_receber")
    .select("id, tipo, valor, conta_id, descricao")
    .eq("id", id)
    .single();
  if (error || !cpr) throw new Error(error?.message ?? "Registro não encontrado");

  const novoStatus = cpr.tipo === "pagar" ? "pago" : "recebido";
  const { error: erroUpdate } = await supabase.from("contas_a_pagar_receber").update({ status: novoStatus }).eq("id", id);
  if (erroUpdate) throw new Error(erroUpdate.message);

  if (cpr.conta_id) {
    const delta = cpr.tipo === "pagar" ? -cpr.valor : cpr.valor;
    const { error: erroInsert } = await supabase.from("movimentacoes_financeiras").insert({
      tipo: cpr.tipo === "pagar" ? "saida" : "entrada",
      valor: delta,
      descricao: cpr.descricao,
      origem: cpr.tipo === "pagar" ? "Conta a pagar quitada" : "Conta a receber recebida",
      categoria: null,
      conta_id: cpr.conta_id,
      afeta_lucro: true,
      data_movimentacao: new Date().toISOString().slice(0, 10),
    });
    if (erroInsert) throw new Error(erroInsert.message);
    await ajustarSaldoConta(supabase, cpr.conta_id, delta);
  }
  revalidateTudo();
}

export interface ContaPagarReceberInput {
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  conta_id: string | null;
}

export async function criarContaPagarReceber(dados: ContaPagarReceberInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("contas_a_pagar_receber").insert(dados);
  if (error) throw new Error(error.message);
  revalidateTudo();
}

// ---------- Limpar dados por período ----------
export interface EscopoLimpeza {
  lancamentos: boolean;
  contasPagarReceber: boolean;
  despesasFixas: boolean;
}

export interface ImpactoLimpeza {
  lancamentos: number;
  contasPagarReceber: number;
  contasVinculadasCompra: number;
  despesasFixas: number;
}

export async function avaliarLimpezaFinanceiro(dataInicio: string, dataFim: string, escopo: EscopoLimpeza): Promise<ImpactoLimpeza> {
  const supabase = await createClient();
  const resultado: ImpactoLimpeza = { lancamentos: 0, contasPagarReceber: 0, contasVinculadasCompra: 0, despesasFixas: 0 };

  if (escopo.lancamentos) {
    const { count, error } = await supabase
      .from("movimentacoes_financeiras")
      .select("id", { count: "exact", head: true })
      .gte("data_movimentacao", dataInicio)
      .lte("data_movimentacao", dataFim);
    if (error) throw new Error(error.message);
    resultado.lancamentos = count ?? 0;
  }

  if (escopo.contasPagarReceber) {
    const { count, error } = await supabase
      .from("contas_a_pagar_receber")
      .select("id", { count: "exact", head: true })
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim);
    if (error) throw new Error(error.message);
    resultado.contasPagarReceber = count ?? 0;

    const { count: vinculadas, error: erroVinculadas } = await supabase
      .from("contas_a_pagar_receber")
      .select("id", { count: "exact", head: true })
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim)
      .not("referencia_pedido_compra_id", "is", null);
    if (erroVinculadas) throw new Error(erroVinculadas.message);
    resultado.contasVinculadasCompra = vinculadas ?? 0;
  }

  if (escopo.despesasFixas) {
    const { count, error } = await supabase
      .from("despesas_fixas")
      .select("id", { count: "exact", head: true })
      .gte("criado_em", dataInicio)
      .lte("criado_em", `${dataFim}T23:59:59`);
    if (error) throw new Error(error.message);
    resultado.despesasFixas = count ?? 0;
  }

  return resultado;
}

export async function limparDadosFinanceiros(dataInicio: string, dataFim: string, escopo: EscopoLimpeza) {
  const supabase = await createClient();

  if (escopo.lancamentos) {
    const { error } = await supabase
      .from("movimentacoes_financeiras")
      .delete()
      .gte("data_movimentacao", dataInicio)
      .lte("data_movimentacao", dataFim);
    if (error) throw new Error(error.message);
  }

  if (escopo.contasPagarReceber) {
    const { error } = await supabase
      .from("contas_a_pagar_receber")
      .delete()
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim);
    if (error) throw new Error(error.message);
  }

  if (escopo.despesasFixas) {
    const { error } = await supabase
      .from("despesas_fixas")
      .delete()
      .gte("criado_em", dataInicio)
      .lte("criado_em", `${dataFim}T23:59:59`);
    if (error) throw new Error(error.message);
  }

  revalidateTudo();
}
