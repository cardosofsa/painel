"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, pagamentoContaSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import type { ParcelaPagar } from "@/lib/pagamentos";

/** Pagar e estornar mexem em Compras, Financeiro, Fornecedores (em aberto) e Dashboard. */
function revalidateTudo() {
  revalidatePath("/compras");
  revalidatePath("/financeiro");
  revalidatePath("/fornecedores");
  revalidatePath("/dashboard");
}

const SEM_MIGRACAO = "O histórico de pagamentos precisa da migração 0064. Aplique no Supabase e recarregue.";

/** Registra um pagamento (valor livre) numa conta a pagar (0064). */
export async function pagarConta(dados: { id: string; valor: number; data: string; conta_id: string; quitar: boolean }) {
  return comResultado(async () => {
    const v = validar(pagamentoContaSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pagar_conta", { p_id: v.id, p_valor: v.valor, p_data: v.data, p_conta_id: v.conta_id, p_quitar: v.quitar });
    if (error?.code === "PGRST202") throw new Error(SEM_MIGRACAO);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    return data as { valor_pago: number; quitada: boolean; restante: number };
  });
}

export async function estornarPagamento(pagamentoId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid("Pagamento inválido"), pagamentoId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("estornar_pagamento_conta", { p_pagamento_id: id });
    if (error?.code === "PGRST202") throw new Error(SEM_MIGRACAO);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

type ParcelaBruta = Omit<ParcelaPagar, "pagamentos" | "valor" | "valor_pago"> & {
  valor: number | string;
  valor_pago: number | string;
  pagamentos_conta: { id: string; valor: number | string; data: string; contas: { nome: string } | null }[] | null;
};

export type AlvoPagamentos = { pedidoId: string } | { contaId: string };

/**
 * Histórico: as parcelas de um pedido de compra (ou uma conta a pagar avulsa) com os
 * pagamentos de cada uma.
 */
export async function obterPagamentos(alvo: AlvoPagamentos) {
  return comResultado(async (): Promise<ParcelaPagar[]> => {
    const id = validar(z.string().uuid("Registro inválido"), "pedidoId" in alvo ? alvo.pedidoId : alvo.contaId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contas_a_pagar_receber")
      .select("id, descricao, valor, valor_pago, status, data_vencimento, data_pagamento, parcela_numero, total_parcelas, conta_id, pagamentos_conta(id, valor, data, contas(nome))")
      .eq("pedidoId" in alvo ? "referencia_pedido_compra_id" : "id", id)
      .eq("tipo", "pagar")
      .order("data_vencimento");
    if (error?.code === "PGRST200" || error?.code === "42703") throw new Error(SEM_MIGRACAO);
    if (error) lancarErroSupabase(error);
    return ((data ?? []) as unknown as ParcelaBruta[]).map((p) => ({
      ...p,
      valor: Number(p.valor),
      valor_pago: Number(p.valor_pago),
      pagamentos: (p.pagamentos_conta ?? [])
        .map((g) => ({ id: g.id, valor: Number(g.valor), data: g.data, conta_nome: g.contas?.nome ?? null }))
        .sort((a, b) => a.data.localeCompare(b.data)),
    }));
  });
}

const recebimentoSchema = z.object({
  id: z.string().uuid("Conta inválida"),
  valor: z.number().finite("Valor inválido").positive("Informe o valor recebido").max(100_000_000),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  conta_id: z.string().uuid("Escolha a conta"),
  quitar: z.boolean(),
});

/**
 * Recebe uma conta a receber (crediário de parcela única ou avulsa) com valor livre (0065):
 * menos que o devido deixa o resto em aberto; o que passar vira "Juros e multa de crediário".
 */
export async function receberConta(dados: { id: string; valor: number; data: string; conta_id: string; quitar: boolean }) {
  return comResultado(async () => {
    const v = validar(recebimentoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("receber_conta", { p_id: v.id, p_valor: v.valor, p_data: v.data, p_conta_id: v.conta_id, p_quitar: v.quitar });
    if (error?.code === "PGRST202") throw new Error("Receber com valor livre precisa da migração 0065. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    revalidatePath("/clientes");
    return data as { valor_pago: number; quitada: boolean; restante: number };
  });
}
