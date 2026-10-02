"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";
import { empurrarEstoquePendente } from "@/lib/marketplace/estoque-servidor";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, vendaSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

export interface VendaInput {
  itens: { produto_id: string; quantidade: number; preco_unitario: number; garantia_dias?: number | null }[];
  status: "paga" | "fiado";
  cliente_id: string | null;
  conta_id: string | null;
  forma_pagamento: string | null;
  desconto: number;
  valor_entrega: number;
  observacao: string | null;
  data_vencimento: string | null;
  entrada_valor: number;
  entrada_forma: "dinheiro" | "pix" | null;
  forma_pagamento_2: string | null;
  parcelas_cartao: number | null;
  taxa_maquineta_pct: number;
  parcelas_fiado: number;
  dias_entre_parcelas: number;
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
 *
 * É o caso mais crítico do `comResultado` (ver `lib/acao.ts`): "Estoque insuficiente para
 * Camiseta Azul P" vem da RPC como `P0001` e diz ao operador de caixa exatamente o que
 * fazer. Lançada, a mensagem seria redigida pelo Next em produção e ele veria um erro
 * genérico com o cliente esperando na frente. O mesmo vale pro limite de fiado insuficiente
 * (0030) — a RPC recusa e a mensagem chega inteira na tela.
 */
export async function registrarVenda(dados: VendaInput) {
  return comResultado(async (): Promise<VendaRegistrada> => {
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
      p_entrada_valor: venda.entrada_valor,
      p_entrada_forma: venda.entrada_forma,
      p_forma_pagamento_2: venda.forma_pagamento_2,
      p_parcelas_cartao: venda.parcelas_cartao,
      p_taxa_maquineta_pct: venda.taxa_maquineta_pct,
      p_parcelas_fiado: venda.parcelas_fiado,
      p_dias_entre_parcelas: venda.dias_entre_parcelas,
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
    revalidatePath("/clientes");

    // Estoque novo para os anúncios das lojas com envio automático (0049), depois da resposta.
    after(() => empurrarEstoquePendente(supabase).catch(() => undefined));

    return registrada;
  });
}

/**
 * Quanto do limite de fiado de um cliente já está em uso agora — chamado do CheckoutModal
 * quando um cliente com fiado liberado é selecionado, só pra mostrar o aviso antes de
 * confirmar. Não bloqueia nada por si só: a trava de verdade é dentro de `registrar_venda`,
 * no banco (ver 0030) — esta consulta pode estar desatualizada entre o carregamento da
 * tela e o clique em "Venda Fiado", e por isso nunca é a única linha de defesa.
 */
export async function obterFiadoEmUsoCliente(clienteId: string) {
  return comResultado(async (): Promise<number> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fiado_em_uso_cliente", { p_cliente_id: clienteId });
    if (error) lancarErroSupabase(error);
    return Number(data ?? 0);
  });
}

/**
 * Venda feita SEM internet (11.4), enviada quando a conexão volta. A `chave` gerada no
 * aparelho garante uma venda só, mesmo reenviando (0060); `feitaEm` mantém a hora real.
 */
export async function registrarVendaOffline(chave: string, feitaEm: string, dados: VendaInput) {
  return comResultado(async (): Promise<VendaRegistrada & { ja_enviada: boolean }> => {
    const supabase = await createClient();
    const venda = validar(vendaSchema, dados);
    const k = validar(z.string().uuid(), chave);
    const quando = validar(z.string().datetime({ offset: true }), feitaEm);
    const { data, error } = await supabase.rpc("registrar_venda_offline", {
      p_chave: k,
      p_feita_em: quando,
      p_itens: venda.itens,
      p_status: venda.status,
      p_cliente_id: venda.cliente_id,
      p_conta_id: venda.conta_id,
      p_forma_pagamento: venda.forma_pagamento,
      p_desconto: venda.desconto,
      p_valor_entrega: venda.valor_entrega,
      p_observacao: venda.observacao,
      p_data_vencimento: venda.data_vencimento,
      p_entrada_valor: venda.entrada_valor,
      p_entrada_forma: venda.entrada_forma,
      p_forma_pagamento_2: venda.forma_pagamento_2,
      p_parcelas_cartao: venda.parcelas_cartao,
      p_taxa_maquineta_pct: venda.taxa_maquineta_pct,
      p_parcelas_fiado: venda.parcelas_fiado,
      p_dias_entre_parcelas: venda.dias_entre_parcelas,
    });
    if (error?.code === "PGRST202") throw new Error("Vendas offline precisam da migração 0060.");
    if (error) lancarErroSupabase(error);
    const r = (data as (VendaRegistrada & { ja_enviada: boolean })[] | null)?.[0];
    if (!r) throw new Error("A venda não retornou confirmação do banco.");
    for (const p of ["/pdv", "/vendas", "/produtos", "/estoque", "/financeiro", "/dashboard", "/clientes"]) revalidatePath(p);
    after(() => empurrarEstoquePendente(supabase).catch(() => undefined));
    return r;
  });
}
