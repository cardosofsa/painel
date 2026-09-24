import { createClient } from "@/lib/supabase/server";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { ComprasClient, type Pedido } from "./ComprasClient";

export default async function ComprasPage() {
  const supabase = await createClient();

  const [
    pedidosRes,
    fornecedoresAtivosRes,
    fornecedoresTodosRes,
    produtosRes,
    armazensRes,
    contasRes,
    formasPagamentoRes,
    titulosRes,
    gruposRes,
  ] = await Promise.all([
      supabase
        .from("pedidos_compra")
        .select(
          "id, numero, fornecedor_id, armazem_id, nf, nf_arquivo_path, valor_total, status, data_pedido, data_entrega_prevista, data_recebimento, forma_pagamento, parcelas, pedidos_compra_itens(produto_id, produto_nome, quantidade, custo_unitario)",
        )
        .order("data_pedido", { ascending: false }),
      supabase.from("fornecedores").select("id, nome").eq("status", "ativo").order("nome"),
      supabase.from("fornecedores").select("id, nome, cnpj"),
      supabase.from("produtos").select("id, nome, custo, grupo_id, variante_nome").order("nome"),
      supabase.from("armazens").select("id, nome").order("nome"),
      supabase.from("contas").select("id, nome").order("nome"),
      supabase.from("formas_pagamento").select("id, nome").order("nome"),
      supabase.from("contas_a_pagar_receber").select("referencia_pedido_compra_id, conta_id").not("referencia_pedido_compra_id", "is", null),
      supabase.from("produto_grupos").select("id, nome"),
    ]);

  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresAtivosRes.error) throw new Error(fornecedoresAtivosRes.error.message);
  if (fornecedoresTodosRes.error) throw new Error(fornecedoresTodosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);
  if (formasPagamentoRes.error) throw new Error(formasPagamentoRes.error.message);
  if (titulosRes.error) throw new Error(titulosRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);

  // O seletor de item renderiza só `nome`: sem o rótulo composto, três variantes
  // viram três opções com texto idêntico e a entrada de estoque vai pro SKU errado.
  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));

  const fornecedoresPorId = new Map((fornecedoresTodosRes.data ?? []).map((f) => [f.id, f]));
  const armazensPorId = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
  const contasPorId = new Map((contasRes.data ?? []).map((c) => [c.id, c.nome]));
  const contaIdPorPedidoId = new Map(
    (titulosRes.data ?? [])
      .filter((t) => t.referencia_pedido_compra_id && t.conta_id)
      .map((t) => [t.referencia_pedido_compra_id as string, t.conta_id as string]),
  );

  const pedidos: Pedido[] = (pedidosRes.data ?? []).map((p) => {
    const fornecedor = p.fornecedor_id ? fornecedoresPorId.get(p.fornecedor_id) : undefined;
    return {
      id: p.id,
      numero: p.numero,
      fornecedor_id: p.fornecedor_id,
      fornecedor_nome: fornecedor?.nome ?? "—",
      cnpj: fornecedor?.cnpj ?? null,
      armazem_id: p.armazem_id,
      armazem_nome: (p.armazem_id && armazensPorId.get(p.armazem_id)) ?? null,
      nf: p.nf,
      nf_arquivo_path: p.nf_arquivo_path,
      valor_total: p.valor_total,
      status: p.status,
      data_pedido: p.data_pedido,
      data_entrega_prevista: p.data_entrega_prevista,
      data_recebimento: p.data_recebimento,
      forma_pagamento: p.forma_pagamento,
      parcelas: p.parcelas,
      conta_nome: (contaIdPorPedidoId.get(p.id) && contasPorId.get(contaIdPorPedidoId.get(p.id)!)) ?? null,
      itens: p.pedidos_compra_itens ?? [],
    };
  });

  return (
    <ComprasClient
      pedidos={pedidos}
      fornecedores={fornecedoresAtivosRes.data ?? []}
      produtos={produtos}
      armazens={armazensRes.data ?? []}
      contas={contasRes.data ?? []}
      formasPagamento={formasPagamentoRes.data ?? []}
    />
  );
}
