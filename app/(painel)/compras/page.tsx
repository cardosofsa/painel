import { createClient } from "@/lib/supabase/server";
import { ComprasClient, type Pedido } from "./ComprasClient";

export default async function ComprasPage() {
  const supabase = await createClient();

  const [pedidosRes, fornecedoresRes, produtosRes, armazensRes] = await Promise.all([
    supabase
      .from("pedidos_compra")
      .select(
        "id, numero, fornecedor_id, armazem_id, nf, nf_arquivo_path, valor_total, status, data_pedido, data_entrega_prevista, data_recebimento, forma_pagamento, parcelas, fornecedores(nome, cnpj), armazens(nome), pedidos_compra_itens(produto_id, produto_nome, quantidade, custo_unitario)",
      )
      .order("data_pedido", { ascending: false }),
    supabase.from("fornecedores").select("id, nome").eq("status", "ativo").order("nome"),
    supabase.from("produtos").select("id, nome, custo").order("nome"),
    supabase.from("armazens").select("id, nome").order("nome"),
  ]);

  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);

  const pedidos: Pedido[] = (pedidosRes.data ?? []).map((p) => {
    const fornecedor = (p.fornecedores as unknown as { nome: string; cnpj: string | null }[] | null)?.[0];
    const armazem = (p.armazens as unknown as { nome: string }[] | null)?.[0];
    return {
      id: p.id,
      numero: p.numero,
      fornecedor_id: p.fornecedor_id,
      fornecedor_nome: fornecedor?.nome ?? "—",
      cnpj: fornecedor?.cnpj ?? null,
      armazem_id: p.armazem_id,
      armazem_nome: armazem?.nome ?? null,
      nf: p.nf,
      nf_arquivo_path: p.nf_arquivo_path,
      valor_total: p.valor_total,
      status: p.status,
      data_pedido: p.data_pedido,
      data_entrega_prevista: p.data_entrega_prevista,
      data_recebimento: p.data_recebimento,
      forma_pagamento: p.forma_pagamento,
      parcelas: p.parcelas,
      itens: p.pedidos_compra_itens ?? [],
    };
  });

  return (
    <ComprasClient
      pedidos={pedidos}
      fornecedores={fornecedoresRes.data ?? []}
      produtos={produtosRes.data ?? []}
      armazens={armazensRes.data ?? []}
    />
  );
}
