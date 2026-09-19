"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateTudo() {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
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

  const { error } = await supabase.rpc("registrar_movimentacao_financeira", {
    p_tipo: dados.tipo,
    p_valor: valorComSinal,
    p_descricao: dados.descricao,
    p_origem: dados.origem,
    p_categoria: dados.categoria,
    p_conta_id: dados.conta_id,
    p_afeta_lucro: dados.afeta_lucro,
    p_data: dados.data_movimentacao,
  });
  if (error) throw new Error(error.message);
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

  const { error: erroRpc } = await supabase.rpc("registrar_movimentacao_financeira", {
    p_tipo: "saida",
    p_valor: -despesa.valor,
    p_descricao: despesa.nome,
    p_origem: "Despesa fixa",
    p_categoria: "Despesas fixas",
    p_conta_id: despesa.conta_id,
    p_afeta_lucro: true,
    p_data: new Date().toISOString().slice(0, 10),
    p_referencia_despesa_fixa_id: despesa.id,
  });
  if (erroRpc) throw new Error(erroRpc.message);
  revalidateTudo();
}

export async function desfazerRetiradaDespesa(movimentacaoId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desfazer_movimentacao_financeira", { p_movimentacao_id: movimentacaoId });
  if (error) throw new Error(error.message);
  revalidateTudo();
}

// ---------- Contas a pagar / receber ----------
export async function quitarContaPagarReceber(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_conta_pagar_receber", { p_id: id });
  if (error) throw new Error(error.message);
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
}

export interface ImpactoLimpeza {
  lancamentos: number;
  contasPagarReceber: number;
  contasVinculadasCompra: number;
}

export async function avaliarLimpezaFinanceiro(dataInicio: string, dataFim: string, escopo: EscopoLimpeza): Promise<ImpactoLimpeza> {
  const supabase = await createClient();
  const resultado: ImpactoLimpeza = { lancamentos: 0, contasPagarReceber: 0, contasVinculadasCompra: 0 };

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

  revalidateTudo();
}
