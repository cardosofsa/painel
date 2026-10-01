import { createClient } from "@/lib/supabase/server";
import { carregarPedidosVitrine } from "@/lib/pedidos-vitrine-servidor";
import { VendasClient, type Venda } from "./VendasClient";

/** Janela máxima carregada; os filtros de período da tela recortam daqui. */
const DIAS_JANELA = 90;

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido } = await searchParams;
  const supabase = await createClient();

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_JANELA);

  const [vendasRes, clientesRes, formasRes, pedidos, clientesPdvRes, contasRes, formasPdvRes] = await Promise.all([
    supabase
      .from("vendas")
      .select(
        "id, numero, data_venda, cliente_id, cliente_nome, forma_pagamento, status, status_envio, subtotal, desconto, valor_entrega, total, custo_total, lucro, observacao, venda_itens(produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario, garantia_dias)",
      )
      .gte("data_venda", inicio.toISOString())
      .order("data_venda", { ascending: false }),
    supabase.from("clientes").select("id, nome, whatsapp").eq("status", "ativo").order("nome"),
    supabase.from("formas_pagamento").select("nome").order("nome"),
    // Pedidos do catálogo moram em Vendas desde a 8.6.
    carregarPedidosVitrine(supabase),
    // As três abaixo alimentam o CheckoutModal do PDV, reaproveitado para fechar o pedido.
    supabase.from("clientes").select("id, nome, whatsapp, permite_fiado, limite_fiado").eq("status", "ativo").order("nome"),
    supabase.from("contas").select("id, nome").order("nome"),
    supabase.from("formas_pagamento").select("nome, tipo").order("nome"),
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
      pedidos={pedidos}
      clientesPdv={clientesPdvRes.data ?? []}
      contas={contasRes.data ?? []}
      formasPagamentoPdv={formasPdvRes.data ?? []}
      pedidoInicial={pedido && /^P-\d{1,8}$/.test(pedido) ? pedido : null}
    />
  );
}
