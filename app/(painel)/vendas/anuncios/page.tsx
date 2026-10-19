import { createClient } from "@/lib/supabase/server";
import { buscarEmLotes } from "@/lib/lotes";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import type { AnuncioCadastrado, PedidoRanking } from "@/lib/marketplace/ranking-anuncios";
import { RankingAnunciosClient } from "./RankingAnunciosClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ranking de anúncios" };

/** Janela carregada; os chips da tela recortam daqui. */
const DIAS_JANELA = 180;

export default async function RankingAnunciosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parametros = await searchParams;
  const supabase = await createClient();
  const [dados, anunciosRes, lojasRes] = await Promise.all([
    carregarPedidosMarketplace(supabase, DIAS_JANELA),
    // `*`: imagem, link e SKU do pai só existem a partir da 0093; sem ela os anúncios caem no título.
    buscarEmLotes((de, ate) => supabase.from("marketplace_anuncios").select("*", { count: "exact" }).order("id").range(de, ate), { maximo: 20000 }),
    supabase.from("lojas_canal").select("id, nome").order("nome"),
  ]);

  const pedidos: PedidoRanking[] = dados.pedidos.map((p) => ({
    loja_id: p.loja_id,
    status: p.status,
    criado_em_plataforma: p.criado_em_plataforma,
    lucro: p.lucro,
    custo_incompleto: p.custo_incompleto,
    itens: p.pedidos_marketplace_itens.map((i) => ({
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
        id: String(a.id),
        loja_id: String(a.loja_id),
        sku_principal: (a.sku_principal as string | null) ?? null,
        nome_item: (a.nome_item as string | null) ?? null,
        nome: (a.nome as string | null) ?? null,
        imagem_url: (a.imagem_url as string | null) ?? null,
        link: (a.link as string | null) ?? null,
      }));

  const lojasComPedido = new Set(dados.pedidos.map((p) => p.loja_id));
  const lojas = ((lojasRes.data ?? []) as { id: string; nome: string }[]).filter((l) => lojasComPedido.has(l.id) || anuncios.some((a) => a.loja_id === l.id));

  return (
    <RankingAnunciosClient
      pedidos={pedidos}
      anuncios={anuncios}
      lojas={lojas}
      agoraIso={new Date().toISOString()}
      diasJanela={DIAS_JANELA}
      semDados={!dados.disponivel}
      parametros={parametros}
    />
  );
}
