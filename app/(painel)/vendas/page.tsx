import { createClient } from "@/lib/supabase/server";
import { VendasClient, type Venda } from "./VendasClient";

/** Janela máxima carregada; os filtros de período da tela recortam daqui. */
const DIAS_JANELA = 90;

export default async function VendasPage() {
  const supabase = await createClient();

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_JANELA);

  const [vendasRes, clientesRes, formasRes] = await Promise.all([
    supabase
      .from("vendas")
      .select(
        "id, numero, data_venda, cliente_id, cliente_nome, forma_pagamento, status, subtotal, desconto, valor_entrega, total, custo_total, lucro, observacao, venda_itens(produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario, garantia_dias)",
      )
      .gte("data_venda", inicio.toISOString())
      .order("data_venda", { ascending: false }),
    supabase.from("clientes").select("id, nome, whatsapp").eq("status", "ativo").order("nome"),
    supabase.from("formas_pagamento").select("nome").order("nome"),
  ]);

  if (vendasRes.error) throw new Error(vendasRes.error.message);
  if (clientesRes.error) throw new Error(clientesRes.error.message);
  if (formasRes.error) throw new Error(formasRes.error.message);

  return (
    <VendasClient
      vendas={(vendasRes.data ?? []) as Venda[]}
      diasJanela={DIAS_JANELA}
      clientes={clientesRes.data ?? []}
      formasPagamento={(formasRes.data ?? []).map((f) => f.nome)}
    />
  );
}
