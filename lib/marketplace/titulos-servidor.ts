import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compararVersoes, periodosDasVersoes, titulosQueMudaram, type VersaoComparada, type VersaoTitulo } from "./titulos-historico";

/**
 * Ciclo de resultado do anúncio (0104): histórico de título e o vínculo do item criado pelo
 * Painel. Tudo aqui é um extra: sem a migração (ou com qualquer erro) não faz nada e não para
 * a sincronização nem a criação. `user_id` explícito: o cron usa a service key.
 */

/** Quantas versões a Análise compara (as mais recentes). */
const MAX_VERSOES = 8;
const PAGINA = 1000;

/** Última versão guardada de cada anúncio da loja. */
async function ultimosTitulos(supabase: SupabaseClient, userId: string, ids: string[]): Promise<Map<string, string> | null> {
  const ultimo = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await supabase
        .from("marketplace_titulos_historico")
        .select("anuncio_id, titulo")
        .eq("user_id", userId)
        .in("anuncio_id", ids.slice(i, i + 200))
        .order("lido_em", { ascending: false })
        .range(de, de + PAGINA - 1);
      if (error) return null;
      for (const r of (data ?? []) as { anuncio_id: string; titulo: string }[]) if (!ultimo.has(r.anuncio_id)) ultimo.set(r.anuncio_id, r.titulo);
      if ((data ?? []).length < PAGINA) break;
    }
  }
  return ultimo;
}

/** Depois da sincronização: grava o título dos anúncios da loja que mudou (ou que ainda não tem versão). */
export async function gravarHistoricoDeTitulo(supabase: SupabaseClient, userId: string, lojaId: string): Promise<void> {
  // `*`: `nome_item` (título do item, 0093) pode não existir; sem ele vale `nome`.
  const { data, error } = await supabase.from("marketplace_anuncios").select("*").eq("user_id", userId).eq("loja_id", lojaId);
  if (error) return;
  const anuncios = (data ?? []) as { id: string; nome?: string | null; nome_item?: string | null }[];
  if (!anuncios.length) return;
  const ultimo = await ultimosTitulos(supabase, userId, anuncios.map((a) => a.id));
  if (!ultimo) return;
  const novos = titulosQueMudaram(ultimo, anuncios.map((a) => ({ id: a.id, titulo: a.nome_item ?? a.nome })));
  for (let i = 0; i < novos.length; i += 500) {
    const { error: erro } = await supabase.from("marketplace_titulos_historico").insert(novos.slice(i, i + 500).map((n) => ({ ...n, user_id: userId, origem: "sincronizacao" })));
    if (erro) return;
  }
}

/**
 * O item que o Painel acabou de criar na Shopee entra em `marketplace_anuncios` já ligado ao
 * produto (antes só aparecia na próxima sincronização, e sem vínculo), e o título vira a
 * primeira versão do histórico. Nunca lança: o item já existe na Shopee, e isto é só o registro.
 */
export async function vincularItemCriado(
  supabase: SupabaseClient,
  i: { userId: string; lojaId: string; itemId: number; produtoId: string; sku: string | null; titulo: string; preco: number | null },
): Promise<string | null> {
  try {
    const base = { user_id: i.userId, loja_id: i.lojaId, item_id: i.itemId, model_id: 0, sku: i.sku, nome: i.titulo, produto_id: i.produtoId, atualizado_em: new Date().toISOString() };
    // Colunas de migrações posteriores (0093 título/0071 preço): sem elas, recua para a base.
    const variantes: Record<string, unknown>[] = [{ ...base, nome_item: i.titulo, preco_atual: i.preco, preco_lido_em: base.atualizado_em }, base];
    let id: string | null = null;
    for (const linha of variantes) {
      const { data, error } = await supabase.from("marketplace_anuncios").upsert(linha, { onConflict: "loja_id,item_id,model_id" }).select("id").single();
      if (!error) {
        id = (data?.id as string | undefined) ?? null;
        break;
      }
      if (error.code !== "PGRST204" && error.code !== "42703") return null;
    }
    if (id) await supabase.from("marketplace_titulos_historico").insert({ user_id: i.userId, anuncio_id: id, titulo: i.titulo.slice(0, 300), origem: "painel" });
    return id;
  } catch {
    return null;
  }
}

/** As versões do título deste anúncio com as vendas de cada período. `null` = sem a 0104. */
export async function versoesDoTitulo(supabase: SupabaseClient, a: { id: string; lojaId: string; produtoId: string }, agora = new Date()): Promise<VersaoComparada[] | null> {
  const { data, error } = await supabase.from("marketplace_titulos_historico").select("titulo, origem, lido_em").eq("anuncio_id", a.id).order("lido_em", { ascending: false }).limit(MAX_VERSOES * 3);
  if (error) return null;
  const versoes: VersaoTitulo[] = ((data ?? []) as { titulo: string; origem: string; lido_em: string }[]).map((r) => ({ titulo: r.titulo, desde: r.lido_em, origem: r.origem === "painel" ? "painel" : "sincronizacao" }));
  const periodos = periodosDasVersoes(versoes).slice(-MAX_VERSOES);
  if (!periodos.length) return [];
  const vendas = await Promise.all(
    periodos.map(async (p) => {
      const { data: v, error: e } = await supabase.rpc("vendas_por_anuncio_periodo", { p_loja: a.lojaId, p_produto: a.produtoId, p_de: p.desde, p_ate: p.ate });
      const linha = (Array.isArray(v) ? v[0] : v) as { unidades: number; receita: number; pedidos: number } | null;
      return e || !linha ? { unidades: 0, receita: 0, pedidos: 0 } : { unidades: Number(linha.unidades), receita: Number(linha.receita), pedidos: Number(linha.pedidos) };
    }),
  );
  return compararVersoes(periodos, vendas, agora);
}
