"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, vendaEdicaoSchema } from "@/lib/validacao";

export interface VendaEdicaoInput {
  cliente_id: string | null;
  forma_pagamento: string | null;
  observacao: string | null;
  desconto: number;
  valor_entrega: number;
  pin: string;
}

function revalidateTudo() {
  revalidatePath("/vendas");
  revalidatePath("/pdv");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}

/**
 * Edita campos que não mexem em estoque nem em itens (cliente, forma de pagamento,
 * observação, desconto, entrega) — para corrigir um item errado o fluxo é cancelar e
 * refazer a venda. Exige o PIN cadastrado em Configurações como segunda confirmação;
 * sem PIN configurado, a edição fica bloqueada (mais seguro que liberar por padrão).
 */
export async function atualizarVenda(vendaId: string, dados: VendaEdicaoInput) {
  const supabase = await createClient();
  const validado = validar(vendaEdicaoSchema, dados);

  const { data: perfil, error: erroPerfil } = await supabase
    .from("perfil_negocio")
    .select("pin_admin")
    .maybeSingle();
  if (erroPerfil) lancarErroSupabase(erroPerfil);

  if (!perfil?.pin_admin) {
    throw new Error("Cadastre um PIN de administração em Configurações → Conta antes de editar uma venda.");
  }
  if (validado.pin !== perfil.pin_admin) {
    throw new Error("PIN incorreto.");
  }

  const { error } = await supabase.rpc("editar_venda", {
    p_venda_id: vendaId,
    p_cliente_id: validado.cliente_id,
    p_forma_pagamento: validado.forma_pagamento,
    p_observacao: validado.observacao,
    p_desconto: validado.desconto,
    p_valor_entrega: validado.valor_entrega,
  });
  if (error) lancarErroSupabase(error);

  revalidateTudo();
}

/**
 * Cancela a venda pela RPC: devolve o estoque, estorna o caixa (ou apaga a conta a
 * receber, no fiado) e marca a venda como cancelada — tudo numa transação. A venda
 * nunca é apagada, pra o número seguir queimado e o histórico auditável.
 */
export async function cancelarVenda(vendaId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("cancelar_venda", { p_venda_id: vendaId });
  if (error) lancarErroSupabase(error);

  revalidatePath("/vendas");
  revalidatePath("/pdv");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
}
