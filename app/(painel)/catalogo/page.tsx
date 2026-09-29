import { createClient } from "@/lib/supabase/server";
import { CatalogoClient, type Catalogo } from "./CatalogoClient";
import type { PedidoVitrine } from "@/components/catalogo/PedidosVitrine";
import { enderecoEmLinha } from "@/lib/comprovante";

/** Formato cru do join de pedidos, antes de virar `PedidoVitrine`. */
interface LinhaPedido {
  id: string;
  numero: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  cliente_email: string | null;
  entrega_cep: string | null;
  entrega_logradouro: string | null;
  entrega_numero: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  observacao: string | null;
  total: number;
  status: PedidoVitrine["status"];
  criado_em: string;
  venda_id: string | null;
  catalogos: { nome: string } | null;
  pedidos_vitrine_itens: {
    id: string;
    produto_id: string | null;
    produto_nome: string;
    quantidade: number;
    preco_unitario: number;
  }[];
}

export default async function CatalogoPage() {
  const supabase = await createClient();

  const [catalogosRes, produtosRes, pedidosRes, clientesRes, contasRes, formasRes] = await Promise.all([
    supabase.from("catalogos").select("id, nome, slug, ativo, tipo_preco, criado_em").order("criado_em"),
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true).gt("estoque", 0),
    supabase
      .from("pedidos_vitrine")
      .select(
        "id, numero, cliente_nome, cliente_whatsapp, cliente_email, entrega_cep, entrega_logradouro, entrega_numero, entrega_bairro, entrega_cidade, entrega_uf, observacao, total, status, criado_em, venda_id, " +
          "catalogos(nome), pedidos_vitrine_itens(id, produto_id, produto_nome, quantidade, preco_unitario)",
      )
      .order("criado_em", { ascending: false })
      .limit(200),
    // As três abaixo alimentam o CheckoutModal do PDV, reaproveitado para fechar a venda.
    supabase.from("clientes").select("id, nome, whatsapp, permite_fiado, limite_fiado").eq("status", "ativo").order("nome"),
    supabase.from("contas").select("id, nome").order("nome"),
    supabase.from("formas_pagamento").select("nome, tipo").order("nome"),
  ]);

  if (catalogosRes.error) throw new Error(catalogosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  // Os pedidos não derrubam a página: quem ainda não aplicou a migração 0027 continua
  // conseguindo usar o catálogo, só sem a aba nova.
  if (pedidosRes.error) console.error("[catalogo] pedidos:", pedidosRes.error.message);

  const pedidos: PedidoVitrine[] = ((pedidosRes.data ?? []) as unknown as LinhaPedido[]).map((p) => ({
    id: p.id,
    numero: p.numero,
    catalogo_nome: p.catalogos?.nome ?? null,
    cliente_nome: p.cliente_nome,
    cliente_whatsapp: p.cliente_whatsapp,
    cliente_email: p.cliente_email,
    entrega: enderecoEmLinha({
      endereco: p.entrega_logradouro,
      numero: p.entrega_numero,
      bairro: p.entrega_bairro,
      cidade: p.entrega_cidade,
      uf: p.entrega_uf,
      cep: p.entrega_cep,
    }),
    observacao: p.observacao,
    total: Number(p.total),
    status: p.status,
    criado_em: p.criado_em,
    venda_id: p.venda_id,
    itens: (p.pedidos_vitrine_itens ?? []).map((i) => ({ ...i, preco_unitario: Number(i.preco_unitario) })),
  }));

  return (
    <CatalogoClient
      catalogos={(catalogosRes.data ?? []) as Catalogo[]}
      totalProdutosElegiveis={produtosRes.count ?? 0}
      pedidos={pedidos}
      clientes={clientesRes.data ?? []}
      contas={contasRes.data ?? []}
      formasPagamento={formasRes.data ?? []}
      // Lido no servidor de propósito: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`, então no
      // cliente ela sempre voltaria `undefined` — só um booleano atravessa.
      iaDisponivel={Boolean(process.env.GEMINI_API_KEY)}
    />
  );
}
