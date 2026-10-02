import type { createClient } from "@/lib/supabase/server";
import type { PedidoVitrine } from "@/lib/pedidos-vitrine-tipos";
import { enderecoEmLinha } from "@/lib/comprovante";
import { formatarCep } from "@/lib/cep";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Formato cru do join de pedidos, antes de virar `PedidoVitrine`. */
interface LinhaPedido {
  id: string;
  numero: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  cliente_email: string | null;
  cliente_id?: string | null;
  entrega_cep: string | null;
  entrega_logradouro: string | null;
  entrega_numero: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  observacao: string | null;
  forma_pagamento?: string | null;
  frete_servico?: string | null;
  frete_servico_id?: number | null;
  frete_valor?: number | null;
  frete_prazo_dias?: number | null;
  total: number;
  status: PedidoVitrine["status"];
  criado_em: string;
  venda_id: string | null;
  catalogos: { nome: string } | null;
  pedidos_vitrine_itens: { id: string; produto_id: string | null; produto_nome: string; quantidade: number; preco_unitario: number }[];
}

/**
 * Pedidos que chegaram pela vitrine. Moram em Vendas desde a 8.6 (antes, no Catálogo): o
 * pedido é uma venda a confirmar, venha do PDV ou do catálogo. Falha aqui não derruba a
 * página — sem as migrações da vitrine, só não aparecem pedidos.
 */
export async function carregarPedidosVitrine(supabase: Supabase, limite = 200): Promise<PedidoVitrine[]> {
  const { data, error } = await supabase
    .from("pedidos_vitrine")
    // `*`: `cliente_id` só existe a partir da 0043.
    .select("*, catalogos(nome), pedidos_vitrine_itens(id, produto_id, produto_nome, quantidade, preco_unitario)")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) {
    console.error("[pedidos-vitrine]", error.message);
    return [];
  }
  return ((data ?? []) as unknown as LinhaPedido[]).map((p) => ({
    id: p.id,
    numero: p.numero,
    catalogo_nome: p.catalogos?.nome ?? null,
    cliente_nome: p.cliente_nome,
    cliente_whatsapp: p.cliente_whatsapp,
    cliente_email: p.cliente_email,
    cliente_id: p.cliente_id ?? null,
    entrega: enderecoEmLinha({
      endereco: p.entrega_logradouro,
      numero: p.entrega_numero,
      bairro: p.entrega_bairro,
      cidade: p.entrega_cidade,
      uf: p.entrega_uf,
      cep: p.entrega_cep ? formatarCep(p.entrega_cep) : null,
    }),
    entrega_cidade: p.entrega_cidade,
    entrega_uf: p.entrega_uf,
    forma_pagamento: p.forma_pagamento ?? null,
    frete: p.frete_servico ? { servico: p.frete_servico, servicoId: p.frete_servico_id ?? null, valor: Number(p.frete_valor ?? 0), prazoDias: p.frete_prazo_dias ?? null } : null,
    observacao: p.observacao,
    total: Number(p.total),
    status: p.status,
    criado_em: p.criado_em,
    venda_id: p.venda_id,
    itens: (p.pedidos_vitrine_itens ?? []).map((i) => ({ ...i, preco_unitario: Number(i.preco_unitario) })),
  }));
}
