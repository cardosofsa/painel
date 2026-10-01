import type { createClient } from "@/lib/supabase/server";
import type { VendaRelatorio } from "@/lib/relatorios-vendas";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Vendas de TODAS as origens (PDV, catálogo e cada loja da Shopee) dos últimos `dias`, no
 * formato dos relatórios (`VendaRelatorio`). Usado em /vendas/relatorios e na Visão Geral.
 */
export async function carregarVendasRelatorio(supabase: Supabase, dias: number): Promise<VendaRelatorio[]> {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - dias * 86_400_000);
  const [vendasRes, pedidosRes, marketplace, lojasRes] = await Promise.all([
    supabase
      .from("vendas")
      .select("id, data_venda, status, total, custo_total, lucro, observacao, clientes(uf), venda_itens(produto_id, produto_nome, quantidade, preco_unitario, custo_unitario)")
      .neq("status", "cancelada")
      .gte("data_venda", inicio.toISOString())
      .order("data_venda")
      .limit(20000),
    supabase.from("pedidos_vitrine").select("venda_id, entrega_uf").not("venda_id", "is", null),
    carregarPedidosMarketplace(supabase, dias),
    supabase.from("lojas_canal").select("id, nome"),
  ]);
  if (vendasRes.error) throw new Error(vendasRes.error.message);

  const doCatalogo = new Map((pedidosRes.data ?? []).map((p) => [p.venda_id as string, (p.entrega_uf as string | null) ?? null]));
  type Linha = {
    id: string;
    data_venda: string;
    total: number;
    custo_total: number;
    lucro: number;
    observacao: string | null;
    clientes: { uf: string | null } | null;
    venda_itens: { produto_id: string | null; produto_nome: string; quantidade: number; preco_unitario: number; custo_unitario: number }[];
  };
  const vendas: VendaRelatorio[] = ((vendasRes.data ?? []) as unknown as Linha[]).map((v) => ({
    id: v.id,
    data: v.data_venda,
    origem: doCatalogo.has(v.id) || (v.observacao ?? "").startsWith("Pedido da vitrine") ? "Catálogo" : "PDV",
    uf: (v.clientes?.uf || doCatalogo.get(v.id) || null)?.toUpperCase() ?? null,
    total: Number(v.total),
    custo: Number(v.custo_total),
    lucro: Number(v.lucro),
    taxas: 0,
    itens: (v.venda_itens ?? []).map((i) => ({
      chave: i.produto_id ?? `nome:${i.produto_nome}`,
      nome: i.produto_nome,
      quantidade: i.quantidade,
      receita: i.quantidade * Number(i.preco_unitario),
      custo: i.quantidade * Number(i.custo_unitario),
    })),
  }));

  // Shopee (0046): cada loja vira uma origem, para comparar as lojas entre si e com o PDV.
  const nomeLoja = new Map((lojasRes.data ?? []).map((l) => [l.id as string, l.nome as string]));
  for (const p of marketplace.pedidos) {
    if (p.status === "cancelado" || p.status === "devolvido" || p.status === "nao_pago" || !p.criado_em_plataforma) continue;
    vendas.push({
      id: `mkt:${p.id}`,
      data: p.criado_em_plataforma,
      origem: `Shopee · ${nomeLoja.get(p.loja_id) ?? "loja"}`,
      uf: p.uf?.toUpperCase() ?? null,
      total: p.subtotal,
      custo: p.custo,
      lucro: p.lucro,
      taxas: p.comissao + p.taxa_servico + p.taxa_transacao + p.cupom_vendedor,
      itens: p.pedidos_marketplace_itens.map((i) => ({
        chave: i.produto_id ?? `nome:${i.nome}`,
        nome: i.nome,
        quantidade: i.quantidade,
        receita: i.quantidade * i.preco_unitario,
        custo: i.quantidade * (i.custo_unitario ?? 0),
      })),
    });
  }
  vendas.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  return vendas;
}
