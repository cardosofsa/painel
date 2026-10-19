import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeIsoBrasil } from "@/lib/format";
import { preverDemanda, type Tendencia } from "@/lib/demanda";
import { serieSemanal } from "@/lib/ajuste-preco";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";
import type { LojaParaPreco } from "@/lib/precos-loja";

export interface VendasPeriodo {
  unidades: number;
  receita: number;
  pedidos: number;
  precoMedio: number;
}

/** Tudo que o Ajuste de Preço (e a aba Preço da Análise) precisa, lido com RLS. */
export interface DadosAjuste {
  produto: { id: string; nome: string; sku: string | null; custo: number; imagemUrl: string | null; estoque: number };
  lojas: { id: string; rotulo: string }[];
  loja: LojaParaPreco | null;
  /** Anúncio sincronizado da Shopee, quando o Ajuste veio dele. */
  anuncio: { id: string; nome: string | null; link: string | null; imagemUrl: string | null } | null;
  precoAtual: number | null;
  origemPrecoAtual: "anuncio" | "loja" | "cadastro";
  impostoPct: number;
  margemAlvo: number;
  concorrentes: number[];
  /** `null` sem a migração 0102 (as somas moram no banco). */
  vendas: { d30: VendasPeriodo; d90: VendasPeriodo } | null;
  serie: number[];
  tendencia: Tendencia;
  vendaPorDia: number;
  kits: { id: string; nome: string }[];
  migracao0101: boolean;
}

const vazio: VendasPeriodo = { unidades: 0, receita: 0, pedidos: 0, precoMedio: 0 };
const lerVendas = (r: { data: unknown; error: unknown }): VendasPeriodo | null => {
  if (r.error) return null;
  const l = (Array.isArray(r.data) ? r.data[0] : r.data) as { unidades: number; receita: number; pedidos: number; preco_medio: number } | undefined;
  return l ? { unidades: Number(l.unidades), receita: Number(l.receita), pedidos: Number(l.pedidos), precoMedio: Number(l.preco_medio) } : vazio;
};

/**
 * Por anúncio sincronizado (`anuncioId`) ou por produto + loja. Devolve `"sem_produto"` quando o
 * anúncio ainda não foi ligado a um produto (a tela manda para o mapeamento) e `null` quando
 * não existe (ou é de outra conta: o RLS esconde).
 */
export async function carregarDadosAjuste(
  supabase: SupabaseClient,
  alvo: { anuncioId: string } | { produtoId: string; lojaId: string | null },
): Promise<DadosAjuste | "sem_produto" | null> {
  let produtoId: string;
  let lojaId: string | null;
  let anuncio: DadosAjuste["anuncio"] = null;
  let precoAnuncio: number | null = null;
  if ("anuncioId" in alvo) {
    const { data } = await supabase.from("marketplace_anuncios").select("*").eq("id", alvo.anuncioId).maybeSingle();
    if (!data) return null;
    const a = data as { id: string; produto_id: string | null; loja_id: string; nome?: string | null; nome_item?: string | null; link?: string | null; imagem_url?: string | null; preco_atual?: number | null };
    if (!a.produto_id) return "sem_produto";
    produtoId = a.produto_id;
    lojaId = a.loja_id;
    anuncio = { id: a.id, nome: a.nome_item ?? a.nome ?? null, link: a.link ?? null, imagemUrl: a.imagem_url ?? null };
    precoAnuncio = a.preco_atual != null && Number(a.preco_atual) > 0 ? Number(a.preco_atual) : null;
  } else {
    produtoId = alvo.produtoId;
    lojaId = alvo.lojaId;
  }

  const [produtoRes, lojasRes, negocioRes, concorrentesRes, precosRes, margensRes, kitsRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, sku, custo, preco_venda, imagem_url, estoque").eq("id", produtoId).maybeSingle(),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    supabase.from("concorrentes_preco").select("preco").eq("produto_id", produtoId),
    supabase.from("produto_lojas").select("loja_id, preco").eq("produto_id", produtoId),
    supabase.from("precificacoes").select("loja_id, margem_pct").eq("produto_id", produtoId).not("margem_pct", "is", null).order("criado_em", { ascending: false }).limit(20),
    supabase.from("produtos").select("id, nome").eq("e_kit", true).contains("insumos", [{ produtoId }]).limit(5),
  ]);
  const p = produtoRes.data as { id: string; nome: string; sku: string | null; custo: number; preco_venda: number | null; imagem_url: string | null; estoque: number | null } | null;
  if (!p) return null;
  const lojas = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({ id: l.id, rotulo: `${l.canais?.nome ?? "—"} · ${l.nome}` }));
  if (!lojaId || !lojas.some((l) => l.id === lojaId)) lojaId = lojas[0]?.id ?? null;

  const [loja, v30, v90, semanas] = await Promise.all([
    lojaId ? carregarLojaParaPreco(supabase, lojaId) : Promise.resolve(null),
    lojaId ? supabase.rpc("vendas_por_anuncio", { p_loja: lojaId, p_produto: produtoId, p_dias: 30 }) : Promise.resolve({ data: null, error: true }),
    lojaId ? supabase.rpc("vendas_por_anuncio", { p_loja: lojaId, p_produto: produtoId, p_dias: 90 }) : Promise.resolve({ data: null, error: true }),
    lojaId ? supabase.rpc("vendas_semanais_por_anuncio", { p_loja: lojaId, p_produto: produtoId, p_semanas: 12 }) : Promise.resolve({ data: null, error: true }),
  ]);

  const precoLoja = precosRes.error ? null : (((precosRes.data ?? []) as { loja_id: string; preco: number | null }[]).find((x) => x.loja_id === lojaId)?.preco ?? null);
  const margens = (margensRes.data ?? []) as { loja_id: string | null; margem_pct: number }[];
  const d30 = lerVendas(v30);
  const d90 = lerVendas(v90);
  const serie = semanas.error ? [] : serieSemanal((semanas.data ?? []) as { semana: string; unidades: number }[], 12, hojeIsoBrasil());
  const previsao = preverDemanda(serie);
  const precoCadastro = p.preco_venda != null && Number(p.preco_venda) > 0 ? Number(p.preco_venda) : null;

  return {
    produto: { id: p.id, nome: p.nome, sku: p.sku, custo: Number(p.custo ?? 0), imagemUrl: p.imagem_url, estoque: Number(p.estoque ?? 0) },
    lojas,
    loja,
    anuncio,
    precoAtual: precoAnuncio ?? (precoLoja != null ? Number(precoLoja) : precoCadastro),
    origemPrecoAtual: precoAnuncio !== null ? "anuncio" : precoLoja != null ? "loja" : "cadastro",
    impostoPct: Number(negocioRes.data?.aliquota_das ?? 6) / 100,
    margemAlvo: Math.max(0, Math.min(0.9, Number((margens.find((m) => m.loja_id === lojaId) ?? margens[0])?.margem_pct ?? 0.25))),
    concorrentes: ((concorrentesRes.data ?? []) as { preco: number }[]).map((c) => Number(c.preco)).filter((n) => n > 0),
    vendas: d30 && d90 ? { d30, d90 } : null,
    serie,
    tendencia: previsao.tendencia,
    vendaPorDia: previsao.porDia,
    kits: kitsRes.error ? [] : ((kitsRes.data ?? []) as { id: string; nome: string }[]),
    migracao0101: !precosRes.error,
  };
}
