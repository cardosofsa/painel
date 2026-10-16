import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmLotes } from "@/lib/lotes";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import type { AnuncioCadastrado, PedidoRanking } from "@/lib/marketplace/ranking-anuncios";
import type { GastoAds } from "./insights";

/** O maior período (90 dias) mais o anterior de mesmo tamanho, para comparar. */
export const DIAS_JANELA_INSIGHTS = 200;

export interface DadosInsights {
  /** false = a 0046 ainda não foi aplicada. */
  disponivel: boolean;
  pedidos: PedidoRanking[];
  anuncios: AnuncioCadastrado[];
  ads: GastoAds[];
  lojas: { id: string; nome: string }[];
}

/**
 * Lê pedidos, anúncios e gasto com Ads da conta logada (chave anônima + RLS). É a ÚNICA fonte
 * dos números do consultor: a tela e a geração por IA usam esta função, então a IA nunca recebe
 * valor vindo do navegador.
 */
export async function carregarDadosInsights(supabase: SupabaseClient): Promise<DadosInsights> {
  const [dados, anunciosRes, adsRes, lojasRes] = await Promise.all([
    carregarPedidosMarketplace(supabase, DIAS_JANELA_INSIGHTS),
    buscarEmLotes((de, ate) => supabase.from("marketplace_anuncios").select("*", { count: "exact" }).order("id").range(de, ate), { maximo: 20000 }),
    // Sem a 0066 a tabela não existe: o consultor segue sem Ads.
    supabase.from("gastos_anuncios").select("loja_id, periodo_inicio, periodo_fim, produto_id, valor").order("periodo_inicio", { ascending: false }).limit(2000),
    supabase.from("lojas_canal").select("id, nome").order("nome"),
  ]);

  const pedidos: PedidoRanking[] = dados.pedidos.map((p) => ({
    loja_id: p.loja_id,
    status: p.status,
    criado_em_plataforma: p.criado_em_plataforma,
    lucro: p.lucro,
    custo_incompleto: p.custo_incompleto,
    itens: p.pedidos_marketplace_itens.map((i) => ({
      produto_id: i.produto_id,
      sku_principal: i.sku_principal ?? null,
      nome: i.nome,
      variacao: i.variacao,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    })),
  }));

  const anuncios: AnuncioCadastrado[] = anunciosRes.error
    ? []
    : ((anunciosRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
        loja_id: String(a.loja_id),
        sku_principal: (a.sku_principal as string | null) ?? null,
        nome_item: (a.nome_item as string | null) ?? null,
        nome: (a.nome as string | null) ?? null,
        imagem_url: (a.imagem_url as string | null) ?? null,
        link: (a.link as string | null) ?? null,
      }));

  const ads: GastoAds[] = adsRes.error
    ? []
    : (adsRes.data ?? []).map((g) => ({
        loja_id: (g.loja_id as string | null) ?? null,
        periodo_inicio: String(g.periodo_inicio),
        periodo_fim: String(g.periodo_fim),
        produto_id: (g.produto_id as string | null) ?? null,
        valor: Number(g.valor ?? 0),
      }));

  const usadas = new Set([...dados.pedidos.map((p) => p.loja_id), ...anuncios.map((a) => a.loja_id)]);
  const lojas = ((lojasRes.data ?? []) as { id: string; nome: string }[]).filter((l) => usadas.has(l.id));

  return { disponivel: dados.disponivel, pedidos, anuncios, ads, lojas };
}
