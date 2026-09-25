"use server";

import { revalidatePath } from "next/cache";
import { hojeIsoLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  movimentacaoSchema,
  despesaFixaSchema,
  contaPagarReceberSchema,
  periodoSchema,
} from "@/lib/validacao";

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
  const v = validar(movimentacaoSchema, dados);
  const valorComSinal = v.tipo === "entrada" ? Math.abs(v.valor) : -Math.abs(v.valor);

  const { error } = await supabase.rpc("registrar_movimentacao_financeira", {
    p_tipo: v.tipo,
    p_valor: valorComSinal,
    p_descricao: v.descricao,
    p_origem: v.origem,
    p_categoria: v.categoria,
    p_conta_id: v.conta_id,
    p_afeta_lucro: v.afeta_lucro,
    p_data: v.data_movimentacao,
  });
  if (error) lancarErroSupabase(error);
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
  const { error } = await supabase.from("despesas_fixas").insert(validar(despesaFixaSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidateTudo();
}

export async function retirarDespesaDaConta(despesaId: string) {
  const supabase = await createClient();
  const { data: despesa, error } = await supabase
    .from("despesas_fixas")
    .select("id, nome, valor, conta_id")
    .eq("id", despesaId)
    .single();
  if (error) lancarErroSupabase(error);
  if (!despesa) throw new Error("Despesa não encontrada.");
  if (!despesa.conta_id) throw new Error("Essa despesa não tem conta vinculada");

  const { error: erroRpc } = await supabase.rpc("registrar_movimentacao_financeira", {
    p_tipo: "saida",
    p_valor: -despesa.valor,
    p_descricao: despesa.nome,
    p_origem: "Despesa fixa",
    p_categoria: "Despesas fixas",
    p_conta_id: despesa.conta_id,
    p_afeta_lucro: true,
    p_data: hojeIsoLocal(),
    p_referencia_despesa_fixa_id: despesa.id,
  });
  if (erroRpc) lancarErroSupabase(erroRpc);
  revalidateTudo();
}

export async function desfazerRetiradaDespesa(movimentacaoId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desfazer_movimentacao_financeira", { p_movimentacao_id: movimentacaoId });
  if (error) lancarErroSupabase(error);
  revalidateTudo();
}

// ---------- Contas a pagar / receber ----------
export async function quitarContaPagarReceber(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_conta_pagar_receber", { p_id: id });
  if (error) lancarErroSupabase(error);
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
  const { error } = await supabase.from("contas_a_pagar_receber").insert(validar(contaPagarReceberSchema, dados));
  if (error) lancarErroSupabase(error);
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
  validar(periodoSchema, { dataInicio, dataFim });
  const resultado: ImpactoLimpeza = { lancamentos: 0, contasPagarReceber: 0, contasVinculadasCompra: 0 };

  if (escopo.lancamentos) {
    const { count, error } = await supabase
      .from("movimentacoes_financeiras")
      .select("id", { count: "exact", head: true })
      .gte("data_movimentacao", dataInicio)
      .lte("data_movimentacao", dataFim);
    if (error) lancarErroSupabase(error);
    resultado.lancamentos = count ?? 0;
  }

  if (escopo.contasPagarReceber) {
    const { count, error } = await supabase
      .from("contas_a_pagar_receber")
      .select("id", { count: "exact", head: true })
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim);
    if (error) lancarErroSupabase(error);
    resultado.contasPagarReceber = count ?? 0;

    const { count: vinculadas, error: erroVinculadas } = await supabase
      .from("contas_a_pagar_receber")
      .select("id", { count: "exact", head: true })
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim)
      .not("referencia_pedido_compra_id", "is", null);
    if (erroVinculadas) lancarErroSupabase(erroVinculadas);
    resultado.contasVinculadasCompra = vinculadas ?? 0;
  }

  return resultado;
}

/**
 * Apaga lançamentos de um período ESTORNANDO o saldo das contas na mesma transação.
 *
 * O DELETE direto que existia aqui quebrava a regra que o resto do sistema respeita — todo
 * lançamento anda junto com o ajuste de `contas.saldo` — e deixava a conta com dinheiro
 * que não tinha mais nenhum lançamento por trás. Também apagava contas a receber ligadas a
 * vendas, e aí `cancelar_venda` passava a falhar para sempre naquela venda.
 */
export async function limparDadosFinanceiros(dataInicio: string, dataFim: string, escopo: EscopoLimpeza) {
  const supabase = await createClient();
  const periodo = validar(periodoSchema, { dataInicio, dataFim });

  const { error } = await supabase.rpc("limpar_financeiro", {
    p_inicio: periodo.dataInicio,
    p_fim: periodo.dataFim,
    p_movimentacoes: escopo.lancamentos,
    p_titulos: escopo.contasPagarReceber,
  });
  if (error) lancarErroSupabase(error);

  revalidateTudo();
}
