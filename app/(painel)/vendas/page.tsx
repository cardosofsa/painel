import { createClient } from "@/lib/supabase/server";
import { carregarPedidosVitrine } from "@/lib/pedidos-vitrine-servidor";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import { faltandoShopee } from "@/lib/marketplace/shopee-api";
import { cofreDisponivel } from "@/lib/ia/cofre";
import { VendasClient, type Venda } from "./VendasClient";

/** Janela máxima carregada; os filtros de período da tela recortam daqui. */
const DIAS_JANELA = 120;

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ pedido?: string; shopee?: string }> }) {
  const { pedido, shopee } = await searchParams;
  const supabase = await createClient();

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_JANELA);

  const [vendasRes, clientesRes, formasRes, pedidos, clientesPdvRes, contasRes, formasPdvRes, marketplace, lojasRes, produtosRes, perfilRes, disponivelRes] = await Promise.all([
    supabase
      .from("vendas")
      // `*`: etapa e logística só existem a partir da 0047.
      .select("*, clientes(cidade, uf), venda_itens(produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario, garantia_dias)")
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
    // Shopee (8.9): sem a 0046 volta `disponivel: false` e a aba explica.
    carregarPedidosMarketplace(supabase, DIAS_JANELA),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    supabase.from("produtos").select("id, sku, nome, custo, estoque").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    // Disponível = físico − reservado (0052). Sem a migração, cai para o físico.
    supabase.from("estoque_disponivel").select("produto_id, disponivel"),
  ]);
  const disponivel: Record<string, number> = disponivelRes.error
    ? Object.fromEntries((produtosRes.data ?? []).map((p) => [p.id, Number(p.estoque ?? 0)]))
    : Object.fromEntries((disponivelRes.data ?? []).map((d) => [d.produto_id as string, Number(d.disponivel)]));

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
      marketplace={marketplace}
      faltandoShopee={[...faltandoShopee(), ...(cofreDisponivel() ? [] : ["IA_CHAVE_COFRE"])]}
      avisoShopee={shopee && ["conectada", "erro", "desligada"].includes(shopee) ? shopee : null}
      lojasMarketplace={((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({
        id: l.id,
        nome: l.nome,
        canalNome: l.canais?.nome ?? "",
      }))}
      produtosMarketplace={(produtosRes.data ?? []).map((p) => ({ id: p.id, sku: p.sku, nome: p.nome, custo: Number(p.custo ?? 0) }))}
      impostoPct={Number(perfilRes.data?.aliquota_das ?? 0) / 100}
      disponivel={disponivel}
    />
  );
}
