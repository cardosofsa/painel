"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, contaAbertaPagamentoSchema, contaAbertaDebitoSchema } from "@/lib/validacao";
import { saldoDoExtrato, type LancamentoFornecedor } from "@/lib/conta-aberta";

const SEM_MIGRACAO = "A conta em aberto com o fornecedor precisa da migração 0095. Aplique no Supabase e recarregue.";

function faltaMigracao(code: string | undefined) {
  return code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883";
}

function revalidar() {
  for (const p of ["/fornecedores", "/financeiro", "/dashboard", "/compras"]) revalidatePath(p);
}

/** Extrato do fornecedor (até 300 linhas, mais recentes primeiro) e o saldo do que veio. */
export async function listarContaAberta(fornecedorId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), fornecedorId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fornecedor_lancamentos")
      .select("id, tipo, valor, data, descricao, criado_em")
      .eq("fornecedor_id", id)
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(300);
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    const lancamentos = ((data ?? []) as (Omit<LancamentoFornecedor, "valor"> & { valor: number | string })[]).map((l) => ({ ...l, valor: Number(l.valor) }));
    return { lancamentos, saldo: saldoDoExtrato(lancamentos) };
  });
}

/** Pagamento avulso (Pix etc.) que abate do saldo do fornecedor. */
export async function pagarContaAberta(dados: { fornecedor_id: string; conta_id: string; valor: number; data: string | null; descricao: string | null }) {
  return comResultado(async () => {
    const v = validar(contaAbertaPagamentoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pagar_em_aberto_fornecedor", { p_fornecedor: v.fornecedor_id, p_valor: v.valor, p_conta: v.conta_id, p_data: v.data, p_descricao: v.descricao });
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    revalidar();
    const r = (data ?? {}) as { pago?: number; saldo?: number };
    return { pago: Number(r.pago ?? v.valor), saldo: Number(r.saldo ?? 0) };
  });
}

/** Dívida antiga em aberto (sem parcelas): sobe o saldo, não mexe no caixa. */
export async function lancarDividaAberta(dados: { fornecedor_id: string; valor: number; data: string | null; descricao: string | null }) {
  return comResultado(async () => {
    const v = validar(contaAbertaDebitoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("lancar_em_aberto_fornecedor", { p_fornecedor: v.fornecedor_id, p_valor: v.valor, p_descricao: v.descricao, p_data: v.data, p_tipo: "divida_antiga", p_pedido: null });
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    revalidar();
    return { saldo: Number(((data ?? {}) as { saldo?: number }).saldo ?? v.valor) };
  });
}

/** Desfaz um lançamento: pagamento (devolve à conta) ou débito lançado por engano. */
export async function estornarLancamentoFornecedor(lancamentoId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), lancamentoId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("estornar_lancamento_fornecedor", { p_id: id });
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    revalidar();
    return { saldo: Number(((data ?? {}) as { saldo?: number }).saldo ?? 0) };
  });
}
