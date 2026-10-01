import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusMarketplace } from "./shopee-planilha";

export interface ItemMarketplaceSalvo {
  produto_id: string | null;
  sku: string | null;
  nome: string;
  variacao: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number | null;
}

export interface PedidoMarketplaceSalvo {
  id: string;
  loja_id: string;
  numero: string;
  status: StatusMarketplace;
  status_original: string | null;
  criado_em_plataforma: string | null;
  pago_em: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  rastreio: string | null;
  /** 0047; ausentes antes da migração. */
  logistica?: string | null;
  prazo_envio?: string | null;
  subtotal: number;
  cupom_vendedor: number;
  comissao: number;
  taxa_servico: number;
  taxa_transacao: number;
  repasse: number;
  custo: number;
  imposto: number;
  lucro: number;
  custo_incompleto: boolean;
  estoque_baixado: boolean;
  pedidos_marketplace_itens: ItemMarketplaceSalvo[];
}

export interface ConexaoResumo {
  loja_id: string;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
}

export interface DadosMarketplace {
  /** false = a 0046 ainda não foi aplicada (a tela explica, sem erro). */
  disponivel: boolean;
  pedidos: PedidoMarketplaceSalvo[];
  vinculos: { loja_id: string; sku_externo: string; produto_id: string }[];
  /** Lojas ligadas à API oficial (só colunas sem token). */
  conexoes: ConexaoResumo[];
}

/** Pedidos dos últimos `dias`, com itens, e os vínculos de SKU. Sem a 0046 devolve vazio. */
export async function carregarPedidosMarketplace(supabase: SupabaseClient, dias = 90): Promise<DadosMarketplace> {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);
  const [pedidosRes, vinculosRes, conexoesRes] = await Promise.all([
    supabase
      .from("pedidos_marketplace")
      .select("*, pedidos_marketplace_itens(produto_id, sku, nome, variacao, quantidade, preco_unitario, custo_unitario)")
      .or(`criado_em_plataforma.gte.${inicio.toISOString()},criado_em_plataforma.is.null`)
      .order("criado_em_plataforma", { ascending: false, nullsFirst: false })
      .limit(3000),
    supabase.from("marketplace_vinculos").select("loja_id, sku_externo, produto_id"),
    supabase.from("marketplace_conexoes").select("loja_id, ultima_sincronizacao, ultimo_erro"),
  ]);
  if (pedidosRes.error) return { disponivel: false, pedidos: [], vinculos: [], conexoes: [] };
  const num = (v: unknown) => Number(v ?? 0);
  return {
    disponivel: true,
    pedidos: ((pedidosRes.data ?? []) as PedidoMarketplaceSalvo[]).map((p) => ({
      ...p,
      subtotal: num(p.subtotal),
      cupom_vendedor: num(p.cupom_vendedor),
      comissao: num(p.comissao),
      taxa_servico: num(p.taxa_servico),
      taxa_transacao: num(p.taxa_transacao),
      repasse: num(p.repasse),
      custo: num(p.custo),
      imposto: num(p.imposto),
      lucro: num(p.lucro),
      pedidos_marketplace_itens: (p.pedidos_marketplace_itens ?? []).map((i) => ({
        ...i,
        preco_unitario: num(i.preco_unitario),
        custo_unitario: i.custo_unitario == null ? null : num(i.custo_unitario),
      })),
    })),
    vinculos: vinculosRes.error ? [] : (vinculosRes.data ?? []),
    conexoes: conexoesRes.error ? [] : (conexoesRes.data ?? []),
  };
}
