import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmLotes, emPedacos } from "@/lib/lotes";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";
import type { LojaParaPreco } from "@/lib/precos-loja";

/** Um anúncio (ou variação de anúncio) da loja ligado a um produto. */
export interface AnuncioDoGrupo {
  id: string;
  itemId: number;
  titulo: string;
  variacao: string | null;
  sku: string | null;
  imagemUrl: string | null;
  link: string | null;
  precoNoAr: number | null;
  precoPlanejado: number | null;
  margemPlanejada: number | null;
}

/** Os anúncios de uma loja que vendem o mesmo produto, com a faixa de margem dele (0114). */
export interface GrupoSku {
  produtoId: string;
  nome: string;
  sku: string | null;
  custo: number;
  imagemUrl: string | null;
  /** Frações; `null` sem faixa no produto. */
  margemMinima: number | null;
  margemMaxima: number | null;
  anuncios: AnuncioDoGrupo[];
}

export interface DadosGrupos {
  lojas: { id: string; rotulo: string }[];
  loja: LojaParaPreco | null;
  impostoPct: number;
  grupos: GrupoSku[];
  /** `false` sem a 0115: não há onde gravar o preço de cada anúncio. */
  migracao0115: boolean;
}

interface Linha {
  id: string;
  item_id: number;
  produto_id: string;
  nome: string | null;
  nome_item?: string | null;
  variacao?: string | null;
  sku: string | null;
  sku_modelo?: string | null;
  imagem_url?: string | null;
  link?: string | null;
  preco_atual?: number | null;
  preco_planejado?: number | null;
  margem_planejada?: number | null;
}

const num = (n: number | null | undefined) => (n != null && Number(n) > 0 ? Number(n) : null);

/**
 * Todos os anúncios ligados a produto de uma loja (`lojaId`, ou a primeira com anúncio),
 * agrupados pelo produto. Lido com RLS; em lotes, porque o PostgREST corta em 1000 linhas.
 */
export async function carregarGruposSku(supabase: SupabaseClient, lojaId: string | null): Promise<DadosGrupos> {
  const [lojasRes, negocioRes] = await Promise.all([
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
  ]);
  const lojas = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({ id: l.id, rotulo: `${l.canais?.nome ?? "—"} · ${l.nome}` }));
  const impostoPct = Number(negocioRes.data?.aliquota_das ?? 6) / 100;
  const escolhida = lojaId && lojas.some((l) => l.id === lojaId) ? lojaId : (lojas[0]?.id ?? null);
  if (!escolhida) return { lojas, loja: null, impostoPct, grupos: [], migracao0115: true };

  // `*`: nome_item, variacao, imagem_url, preco_atual e preco_planejado dependem de migrações.
  const [loja, anunciosRes] = await Promise.all([
    carregarLojaParaPreco(supabase, escolhida),
    buscarEmLotes((de, ate) =>
      supabase.from("marketplace_anuncios").select("*", { count: "exact" }).eq("loja_id", escolhida).not("produto_id", "is", null).order("item_id").order("model_id").order("id").range(de, ate),
    ),
  ]);
  const linhas = (anunciosRes.data ?? []) as Linha[];
  const ids = [...new Set(linhas.map((l) => l.produto_id))];

  type Produto = { id: string; nome: string; sku: string | null; custo: number | null; imagem_url: string | null; margem_minima?: number | null; margem_maxima?: number | null };
  const produtos = new Map<string, Produto>();
  for (const pedaco of emPedacos(ids)) {
    const r = await supabase.from("produtos").select("id, nome, sku, custo, imagem_url, margem_minima, margem_maxima").in("id", pedaco);
    // Sem a 0114 as colunas da faixa não existem: lê sem elas.
    const linhasProd = r.error ? (await supabase.from("produtos").select("id, nome, sku, custo, imagem_url").in("id", pedaco)).data : r.data;
    for (const p of (linhasProd ?? []) as Produto[]) produtos.set(p.id, p);
  }

  const porProduto = new Map<string, AnuncioDoGrupo[]>();
  for (const l of linhas) {
    if (!produtos.has(l.produto_id)) continue;
    const titulo = l.nome_item ?? l.nome ?? `Anúncio ${l.item_id}`;
    porProduto.set(l.produto_id, [
      ...(porProduto.get(l.produto_id) ?? []),
      {
        id: l.id,
        itemId: Number(l.item_id),
        titulo,
        variacao: l.variacao?.trim() || null,
        sku: l.sku_modelo ?? l.sku ?? null,
        imagemUrl: l.imagem_url ?? null,
        link: l.link ?? null,
        precoNoAr: num(l.preco_atual),
        precoPlanejado: num(l.preco_planejado),
        margemPlanejada: l.margem_planejada != null ? Number(l.margem_planejada) : null,
      },
    ]);
  }

  const grupos: GrupoSku[] = [...porProduto].map(([produtoId, anuncios]) => {
    const p = produtos.get(produtoId)!;
    return {
      produtoId,
      nome: p.nome,
      sku: p.sku,
      custo: Number(p.custo ?? 0),
      imagemUrl: p.imagem_url,
      margemMinima: p.margem_minima != null ? Number(p.margem_minima) : null,
      margemMaxima: p.margem_maxima != null ? Number(p.margem_maxima) : null,
      anuncios,
    };
  });
  // Os SKUs com mais anúncios primeiro (é para eles que a tela existe), depois por nome.
  grupos.sort((a, b) => b.anuncios.length - a.anuncios.length || a.nome.localeCompare(b.nome, "pt-BR"));

  return { lojas, loja, impostoPct, grupos, migracao0115: linhas.length === 0 || "preco_planejado" in linhas[0] };
}
