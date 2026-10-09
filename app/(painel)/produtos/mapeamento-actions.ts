"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { filtrosDeBusca, lerTermo } from "@/lib/listas";
import { semColuna } from "@/lib/variacoes-consulta";
import { chaveVinculoAnuncio } from "@/lib/marketplace/anuncios-mapeamento";
import { atualizarAnuncios } from "@/lib/marketplace/estoque-servidor";
import type { ConexaoShopee } from "@/lib/marketplace/tokens";


interface LinhaAnuncio {
  id: string;
  loja_id: string;
  sku: string | null;
  nome: string | null;
  sku_modelo?: string | null;
  sku_principal?: string | null;
  nome_item?: string | null;
  variacao?: string | null;
}

/** `*` (não as colunas da 0093 por nome): banco sem a migração devolve as antigas e a chave cai no `sku`. */
async function lerAnuncio(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase.from("marketplace_anuncios").select("*").eq("id", id).maybeSingle();
  if (error) lancarErroSupabase(error);
  if (!data) throw new Error("Anúncio não encontrado. Use “Detectar anúncios” e tente de novo.");
  const l = data as LinhaAnuncio;
  const chave = chaveVinculoAnuncio({ sku: l.sku, sku_modelo: l.sku_modelo ?? null, sku_principal: l.sku_principal ?? null, nome: l.nome, nome_item: l.nome_item ?? null, variacao: l.variacao ?? null });
  if (!chave) throw new Error("Esse anúncio não tem SKU nem título para vincular.");
  return { anuncio: l, chave };
}

/** Dos ids dados, quais são produto pai com variações (0084: outros produtos apontam para eles em `produto_pai_id`). Sem a migração, nenhum. */
async function idsComVariacoes(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.from("produtos").select("produto_pai_id").in("produto_pai_id", ids);
  if (error) {
    if (semColuna(error)) return new Set();
    lancarErroSupabase(error);
  }
  return new Set(((data ?? []) as { produto_pai_id: string }[]).map((r) => r.produto_pai_id));
}

function revalidar() {
  revalidatePath("/produtos");
  revalidatePath("/produtos/mapeamento");
  revalidatePath("/vendas");
  revalidatePath("/estoque");
}

/**
 * Vincula o anúncio a UM produto (combo = Kit cadastrado). Passa por `revincular_itens_marketplace`
 * (0047/0084): grava o vínculo para as próximas importações, recalcula o lucro dos pedidos que
 * estavam sem produto e baixa o estoque que faltou. Depois marca o anúncio como pendente para o
 * saldo do produto ir para a plataforma.
 */
export async function mapearAnuncio(anuncioId: string, produtoId: string) {
  return comResultado(async () => {
    const v = validar(z.object({ anuncioId: z.string().uuid(), produtoId: z.string().uuid() }), { anuncioId, produtoId });
    const supabase = await createClient();
    const { anuncio, chave } = await lerAnuncio(supabase, v.anuncioId);
    if ((await idsComVariacoes(supabase, [v.produtoId])).size > 0) {
      throw new Error("Esse produto tem variações. Mapeie o anúncio para a variação certa, não para o produto pai.");
    }
    const { data: perfil } = await supabase.from("perfil_negocio").select("aliquota_das").maybeSingle();
    const { data, error } = await supabase.rpc("revincular_itens_marketplace", {
      p_loja_id: anuncio.loja_id,
      p_sku: chave,
      p_produto_id: v.produtoId,
      p_imposto_pct: Number(perfil?.aliquota_das ?? 0) / 100,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") throw new Error("Mapear anúncio precisa da migração 0047. Aplique no Supabase e recarregue.");
      lancarErroSupabase(error);
    }
    const { error: e2 } = await supabase.from("marketplace_anuncios").update({ produto_id: v.produtoId, pendente: true, atualizado_em: new Date().toISOString() }).eq("id", v.anuncioId);
    if (e2) lancarErroSupabase(e2);
    revalidar();
    return (data ?? { pedidos: 0, baixas: 0 }) as { pedidos: number; baixas: number };
  });
}

/**
 * Tira o vínculo manual do anúncio. Se o SKU dele ainda for igual ao SKU de um produto, a
 * próxima detecção volta a mapear por SKU (o aviso sai no toast). Pedidos já recalculados
 * não são desfeitos.
 */
export async function desmapearAnuncio(anuncioId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), anuncioId);
    const supabase = await createClient();
    const { anuncio, chave } = await lerAnuncio(supabase, id);
    const { data: vinculos, error: e1 } = await supabase.from("marketplace_vinculos").select("id, sku_externo").eq("loja_id", anuncio.loja_id);
    if (e1) lancarErroSupabase(e1);
    const ids = (vinculos ?? []).filter((x) => String(x.sku_externo).toLowerCase() === chave.toLowerCase()).map((x) => x.id as string);
    if (ids.length) {
      const { error } = await supabase.from("marketplace_vinculos").delete().in("id", ids);
      if (error) lancarErroSupabase(error);
    }
    const { data: igual } = await supabase.from("produtos").select("id").ilike("sku", chave.replace(/[%_\\]/g, "\\$&")).limit(1);
    const { error: e2 } = await supabase.from("marketplace_anuncios").update({ produto_id: null, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (e2) lancarErroSupabase(e2);
    revalidar();
    return { voltaPorSku: (igual ?? []).length > 0 };
  });
}

export interface ResultadoDeteccao {
  lojas: number;
  anuncios: number;
  erros: string[];
}

/** "Detectar anúncios": relê a listagem das lojas conectadas (uma ou todas) e casa com os produtos por SKU/vínculo. */
export async function detectarAnuncios(lojaId: string | null) {
  return comResultado(async (): Promise<ResultadoDeteccao> => {
    const loja = validar(z.string().uuid().nullable(), lojaId);
    const supabase = await createClient();
    let q = supabase.from("marketplace_conexoes").select("*");
    if (loja) q = q.eq("loja_id", loja);
    const { data, error } = await q;
    if (error) lancarErroSupabase(error);
    const conexoes = (data ?? []) as ConexaoShopee[];
    if (conexoes.length === 0) throw new Error("Nenhuma loja conectada à API. Conecte em Configurações > Canais de venda.");
    const erros: string[] = [];
    let anuncios = 0;
    let lojas = 0;
    for (const c of conexoes) {
      try {
        anuncios += await atualizarAnuncios(supabase, c);
        lojas++;
      } catch (e) {
        erros.push(e instanceof Error ? e.message : "Falha ao ler os anúncios");
      }
    }
    revalidar();
    return { lojas, anuncios, erros };
  });
}

export interface ProdutoParaMapa {
  id: string;
  nome: string;
  sku: string | null;
  imagem: string | null;
  /** Nome da variação (ex.: "Kit 2"); nulo no produto pai e no produto comum. */
  variante: string | null;
  /** Produto pai com variações: aparece só como referência, não dá para vincular. */
  temVariacoes: boolean;
}

/** Até 20 produtos ativos por nome ou SKU: o catálogo todo não vai para o navegador. */
export async function buscarProdutosParaMapa(termo: string) {
  return comResultado(async (): Promise<ProdutoParaMapa[]> => {
    const t = lerTermo(validar(z.string().max(200), termo ?? ""));
    const supabase = await createClient();
    let q = supabase.from("produtos").select("id, nome, sku, variante_nome, produto_imagens(url, ordem)").eq("ativo", true).order("nome").order("variante_nome", { nullsFirst: true }).order("id").limit(20);
    for (const f of filtrosDeBusca(t, ["nome", "sku", "variante_nome"])) q = q.or(f);
    const { data, error } = await q;
    if (error) lancarErroSupabase(error);
    const linhas = (data ?? []) as unknown as { id: string; nome: string; sku: string | null; variante_nome: string | null; produto_imagens: { url: string; ordem: number | null }[] | null }[];
    // Produto pai com variações vem só como referência (`temVariacoes`); quem se vincula é a variação.
    const pais = await idsComVariacoes(supabase, linhas.map((p) => p.id));
    return linhas.map((p) => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      variante: p.variante_nome,
      temVariacoes: pais.has(p.id),
      imagem: [...(p.produto_imagens ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0]?.url ?? null,
    }));
  });
}
