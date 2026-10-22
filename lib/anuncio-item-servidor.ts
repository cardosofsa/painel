import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";
import type { LojaParaPreco } from "@/lib/precos-loja";
import type { VariacaoDoAnuncio } from "@/lib/reprecificar-anuncio";

/** Um anúncio da loja como na Shopee: título, capa, link e todas as variações do mesmo item. */
export interface ItemAnuncio {
  titulo: string;
  imagemUrl: string | null;
  link: string | null;
  itemId: number;
  loja: LojaParaPreco | null;
  impostoPct: number;
  /** Margem da precificação mais recente de um dos produtos nesta loja (padrão 25%). Fração. */
  margemAlvo: number;
  variacoes: VariacaoDoAnuncio[];
  /** `false` sem a 0115: não há onde gravar o preço de cada anúncio. */
  migracao0115: boolean;
}

interface LinhaAnuncio {
  id: string;
  loja_id: string;
  item_id: number;
  model_id: number;
  sku: string | null;
  nome: string | null;
  produto_id: string | null;
  preco_atual?: number | null;
  imagem_url?: string | null;
  link?: string | null;
  sku_modelo?: string | null;
  variacao?: string | null;
  nome_item?: string | null;
  preco_planejado?: number | null;
}

/**
 * Por qualquer variação do anúncio (`marketplace_anuncios.id`): lê as outras do mesmo item
 * (mesma loja e `item_id`), os produtos ligados e o preço gravado na loja, tudo com RLS.
 * `null` quando não existe (ou é de outra conta).
 */
export async function carregarItemAnuncio(supabase: SupabaseClient, anuncioId: string): Promise<ItemAnuncio | null> {
  // `*`: imagem_url, link, variacao, nome_item e preco_atual dependem de migrações (0071/0093).
  const { data: alvo } = await supabase.from("marketplace_anuncios").select("*").eq("id", anuncioId).maybeSingle();
  if (!alvo) return null;
  const a = alvo as LinhaAnuncio;
  const { data: irmas } = await supabase.from("marketplace_anuncios").select("*").eq("loja_id", a.loja_id).eq("item_id", a.item_id).order("model_id");
  const linhas = irmas && irmas.length ? (irmas as LinhaAnuncio[]) : [a];
  const titulo = a.nome_item ?? linhas.find((l) => l.nome_item)?.nome_item ?? a.nome ?? `Anúncio ${a.item_id}`;
  const ids = [...new Set(linhas.map((l) => l.produto_id).filter((x): x is string => !!x))];

  const [loja, produtosRes, precosRes, negocioRes, margensRes] = await Promise.all([
    carregarLojaParaPreco(supabase, a.loja_id),
    ids.length ? supabase.from("produtos").select("id, nome, sku, custo, estoque, imagem_url").in("id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("produto_lojas").select("produto_id, preco").eq("loja_id", a.loja_id).in("produto_id", ids) : Promise.resolve({ data: [], error: null }),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    ids.length
      ? supabase.from("precificacoes").select("loja_id, margem_pct").in("produto_id", ids).not("margem_pct", "is", null).order("criado_em", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const produtos = new Map(((produtosRes.data ?? []) as { id: string; nome: string; sku: string | null; custo: number | null; estoque: number | null; imagem_url: string | null }[]).map((p) => [p.id, p]));
  const precos = new Map((precosRes.error ? [] : ((precosRes.data ?? []) as { produto_id: string; preco: number | null }[])).map((p) => [p.produto_id, p.preco]));
  const margens = (margensRes.data ?? []) as { loja_id: string | null; margem_pct: number }[];
  const margem = Number((margens.find((m) => m.loja_id === a.loja_id) ?? margens[0])?.margem_pct ?? 0.25);
  const num = (n: number | null | undefined) => (n != null && Number(n) > 0 ? Number(n) : null);

  const variacoes: VariacaoDoAnuncio[] = linhas.map((l) => {
    const p = l.produto_id ? produtos.get(l.produto_id) : undefined;
    return {
      anuncioId: l.id,
      modelId: Number(l.model_id),
      // Antes da 0093 só há `nome` (título + variação juntos): sobra a parte da variação.
      variacao: l.variacao?.trim() || (linhas.length > 1 ? l.nome?.replace(titulo, "").replace(/^[\s\-–·,:]+/, "").trim() || `Modelo ${l.model_id}` : null),
      sku: l.sku_modelo ?? l.sku ?? null,
      imagemUrl: l.imagem_url ?? null,
      produtoId: p ? p.id : null,
      produtoNome: p?.nome ?? null,
      custo: Number(p?.custo ?? 0),
      estoque: p ? Number(p.estoque ?? 0) : null,
      precoNoAr: num(l.preco_atual),
      precoLoja: p ? num(precos.get(p.id)) : null,
      precoPlanejado: num(l.preco_planejado),
    };
  });
  const capa = linhas.find((l) => l.imagem_url)?.imagem_url ?? variacoes.map((v) => (v.produtoId ? produtos.get(v.produtoId)?.imagem_url : null)).find(Boolean) ?? null;

  return {
    titulo,
    imagemUrl: capa,
    link: linhas.find((l) => l.link)?.link ?? null,
    itemId: Number(a.item_id),
    loja,
    impostoPct: Number(negocioRes.data?.aliquota_das ?? 6) / 100,
    margemAlvo: Math.max(0, Math.min(0.9, margem)),
    variacoes,
    migracao0115: "preco_planejado" in a,
  };
}
