"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, vendaSchema } from "@/lib/validacao";

export interface VendaInput {
  itens: { produto_id: string; quantidade: number; preco_unitario: number }[];
  status: "paga" | "fiado";
  cliente_id: string | null;
  conta_id: string | null;
  forma_pagamento: string | null;
  desconto: number;
  valor_entrega: number;
  observacao: string | null;
  data_vencimento: string | null;
}

export interface VendaRegistrada {
  venda_id: string;
  venda_numero: string;
  venda_total: number;
  venda_lucro: number;
}

/**
 * Tudo acontece dentro da RPC `registrar_venda`: validar estoque, criar a venda e os
 * itens, baixar o estoque e lançar o caixa (ou a conta a receber, no fiado) — numa
 * transação só. Se qualquer passo falhar, nada é gravado.
 */
export async function registrarVenda(dados: VendaInput): Promise<VendaRegistrada> {
  const supabase = await createClient();
  const venda = validar(vendaSchema, dados);

  const { data, error } = await supabase.rpc("registrar_venda", {
    p_itens: venda.itens,
    p_status: venda.status,
    p_cliente_id: venda.cliente_id,
    p_conta_id: venda.conta_id,
    p_forma_pagamento: venda.forma_pagamento,
    p_desconto: venda.desconto,
    p_valor_entrega: venda.valor_entrega,
    p_observacao: venda.observacao,
    p_data_vencimento: venda.data_vencimento,
  });

  if (error) lancarErroSupabase(error);

  const registrada = (data as VendaRegistrada[] | null)?.[0];
  if (!registrada) throw new Error("A venda não retornou confirmação do banco. Confira em Vendas antes de repetir.");

  revalidatePath("/pdv");
  revalidatePath("/vendas");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");

  return registrada;
}
