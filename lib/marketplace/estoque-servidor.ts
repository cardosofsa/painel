import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agruparPorItem, casarAnuncios, diferencasEstoque, semProdutosPai, type AnuncioSalvo, type DiferencaEstoque } from "./estoque-shopee";
import type { ConexaoShopee } from "./tokens";
import { apiDaConexao } from "./conexao-api";

/**
 * Estoque do Sertão → anúncios da Shopee, por loja conectada. Código de SERVIDOR; funciona
 * com a sessão do dono e com a service key do cron (sempre filtra por `user_id`).
 */

/** Relê a listagem da Shopee de tempos em tempos (anúncio novo, SKU trocado). */
const LISTAGEM_VALE_MS = 6 * 60 * 60 * 1000;

export async function atualizarAnuncios(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<number> {
  const anuncios = await (await apiDaConexao(supabase, conexao)).buscarAnuncios();
  const [produtosRes, vinculosRes, paisRes] = await Promise.all([
    supabase.from("produtos").select("id, sku, custo").eq("user_id", conexao.user_id),
    supabase.from("marketplace_vinculos").select("sku_externo, produto_id").eq("user_id", conexao.user_id).eq("loja_id", conexao.loja_id),
    // Pais com variações (0084). Sem a migração a coluna não existe e nenhum produto é pai.
    supabase.from("produtos").select("produto_pai_id").eq("user_id", conexao.user_id).not("produto_pai_id", "is", null),
  ]);
  const idsPai = new Set(paisRes.error ? [] : ((paisRes.data ?? []) as { produto_pai_id: string }[]).map((r) => r.produto_pai_id));
  const produtos = semProdutosPai(
    (produtosRes.data ?? []).map((p) => ({ id: p.id as string, sku: p.sku as string | null, custo: Number(p.custo ?? 0) })),
    idsPai,
  );
  const agoraIso = new Date().toISOString();
  const precos = new Map(anuncios.map((a) => [`${a.itemId}:${a.modelId}`, a.preco ?? null]));
  const base = casarAnuncios(anuncios, produtos, vinculosRes.data ?? []).map((l) => ({ ...l, user_id: conexao.user_id, loja_id: conexao.loja_id, atualizado_em: agoraIso }));
  // Colunas que dependem de migração (mapeamento 0093, preço 0071): sem elas a coluna não
  // existe, e a gravação recua para o conjunto anterior em vez de parar a sincronização.
  const sem0093 = (l: (typeof base)[number]): Record<string, unknown> => {
    const copia: Record<string, unknown> = { ...l };
    for (const c of ["imagem_url", "link", "sku_modelo", "sku_principal", "variacao", "nome_item"]) delete copia[c];
    return copia;
  };
  const comPreco = (l: Record<string, unknown>, k: string) => ({ ...l, preco_atual: precos.get(k) ?? null, preco_lido_em: agoraIso });
  const chave = (l: (typeof base)[number]) => `${l.item_id}:${l.model_id}`;
  const variantes: ((l: (typeof base)[number]) => Record<string, unknown>)[] = [
    (l) => comPreco(l, chave(l)),
    (l) => comPreco(sem0093(l), chave(l)),
    (l) => sem0093(l),
  ];
  let nivel = 0;
  for (let i = 0; i < base.length; i += 500) {
    const fatia = base.slice(i, i + 500);
    for (;;) {
      const { error } = await supabase.from("marketplace_anuncios").upsert(fatia.map(variantes[nivel]), { onConflict: "loja_id,item_id,model_id" });
      if (!error) break;
      if (nivel < variantes.length - 1 && (error.code === "PGRST204" || error.code === "42703")) {
        nivel++;
        continue;
      }
      throw new Error(error.message);
    }
  }
  const linhas = base;
  await supabase.from("marketplace_conexoes").update({ anuncios_atualizados_em: new Date().toISOString() }).eq("id", conexao.id);
  return linhas.length;
}

/**
 * Saldo de cada produto no armazém que abastece a loja (sem armazém marcado, o total),
 * MENOS o reservado por pedidos de OUTRAS origens (catálogo, outras lojas — 0052). Os
 * pedidos da própria loja não descontam: a plataforma já tirou essas unidades do anúncio.
 */
export async function saldosDaLoja(supabase: SupabaseClient, userId: string, lojaId: string): Promise<Map<string, number>> {
  const fisico = await saldosFisicosDaLoja(supabase, userId, lojaId);
  const { data, error } = await supabase
    .from("estoque_reservas")
    .select("produto_id, quantidade, pedidos_marketplace(loja_id)")
    .eq("user_id", userId);
  if (error) return fisico;
  for (const r of (data ?? []) as unknown as { produto_id: string; quantidade: number; pedidos_marketplace: { loja_id: string } | null }[]) {
    if (r.pedidos_marketplace?.loja_id === lojaId) continue;
    if (fisico.has(r.produto_id)) fisico.set(r.produto_id, Math.max(0, (fisico.get(r.produto_id) ?? 0) - Number(r.quantidade)));
  }
  return fisico;
}

async function saldosFisicosDaLoja(supabase: SupabaseClient, userId: string, lojaId: string): Promise<Map<string, number>> {
  const { data: armazens } = await supabase.from("armazens").select("*").eq("user_id", userId);
  const armazem = ((armazens ?? []) as { id: string; loja_ids?: string[] | null; criado_em?: string }[])
    .filter((a) => (a.loja_ids ?? []).includes(lojaId))
    .sort((a, b) => (a.criado_em ?? "").localeCompare(b.criado_em ?? ""))[0];
  if (armazem) {
    const { data, error } = await supabase.from("estoque_armazem").select("produto_id, quantidade").eq("user_id", userId).eq("armazem_id", armazem.id);
    if (!error) return comKits(supabase, userId, new Map((data ?? []).map((r) => [r.produto_id as string, Number(r.quantidade)])));
  }
  const { data } = await supabase.from("produtos").select("id, estoque").eq("user_id", userId);
  return new Map((data ?? []).map((p) => [p.id as string, Number(p.estoque)]));
}

async function anunciosDaLoja(supabase: SupabaseClient, conexao: ConexaoShopee, soPendentes: boolean): Promise<(AnuncioSalvo & { id: string; pendente: boolean })[]> {
  let q = supabase.from("marketplace_anuncios").select("id, item_id, model_id, sku, nome, produto_id, estoque_shopee, estoque_enviado, pendente").eq("user_id", conexao.user_id).eq("loja_id", conexao.loja_id);
  if (soPendentes) q = q.eq("pendente", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as (AnuncioSalvo & { id: string; pendente: boolean })[];
}

/** Prévia "Sertão × Shopee" (relê a listagem para mostrar o estoque de agora na Shopee). */
export async function previaEstoque(supabase: SupabaseClient, conexao: ConexaoShopee): Promise<{ total: number; semVinculo: number; diferencas: DiferencaEstoque[] }> {
  await atualizarAnuncios(supabase, conexao);
  const anuncios = await anunciosDaLoja(supabase, conexao, false);
  // Na prévia vale o que a Shopee mostra AGORA, não o último envio.
  const comoEsta = anuncios.map((a) => ({ ...a, estoque_enviado: null }));
  const saldos = await saldosDaLoja(supabase, conexao.user_id, conexao.loja_id);
  return { total: anuncios.length, semVinculo: anuncios.filter((a) => !a.produto_id).length, diferencas: diferencasEstoque(comoEsta, saldos) };
}

/**
 * Envia o estoque. Por padrão só os anúncios pendentes e só se a loja ativou o envio
 * automático (com a prévia confirmada). `tudo` (ativação) envia todos os vinculados.
 */
export async function enviarEstoqueConexao(supabase: SupabaseClient, conexao: ConexaoShopee, opcoes: { tudo?: boolean } = {}): Promise<{ enviados: number; erros: string[] }> {
  if (!opcoes.tudo && !(conexao.estoque_auto && conexao.estoque_confirmado_em)) return { enviados: 0, erros: [] };
  const velha = !conexao.anuncios_atualizados_em || Date.now() - new Date(conexao.anuncios_atualizados_em).getTime() > LISTAGEM_VALE_MS;
  if (velha) await atualizarAnuncios(supabase, conexao);

  const anuncios = await anunciosDaLoja(supabase, conexao, !opcoes.tudo);
  if (!anuncios.length) return { enviados: 0, erros: [] };
  const saldos = await saldosDaLoja(supabase, conexao.user_id, conexao.loja_id);
  const diffs = diferencasEstoque(anuncios, saldos);
  const api = await apiDaConexao(supabase, conexao);

  let enviados = 0;
  const erros: string[] = [];
  const porChave = new Map(anuncios.map((a) => [`${a.item_id}:${a.model_id}`, a.id]));
  for (const g of agruparPorItem(diffs)) {
    try {
      await api.enviarEstoque(g.itemId, g.estoques);
      for (const e of g.estoques) {
        const id = porChave.get(`${g.itemId}:${e.modelId}`);
        if (id) await supabase.from("marketplace_anuncios").update({ estoque_enviado: e.quantidade, estoque_shopee: e.quantidade, enviado_em: new Date().toISOString(), pendente: false, ultimo_erro: null }).eq("id", id);
        enviados++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : "erro";
      erros.push(`Anúncio ${g.itemId}: ${msg}`);
      for (const est of g.estoques) {
        const id = porChave.get(`${g.itemId}:${est.modelId}`);
        if (id) await supabase.from("marketplace_anuncios").update({ ultimo_erro: msg }).eq("id", id);
      }
    }
  }
  // Pendentes sem diferença (saldo voltou ao mesmo) deixam de ser pendentes.
  const enviadosChaves = new Set(diffs.map((d) => `${d.itemId}:${d.modelId}`));
  const semMudanca = anuncios.filter((a) => a.pendente && !enviadosChaves.has(`${a.item_id}:${a.model_id}`)).map((a) => a.id);
  if (semMudanca.length) await supabase.from("marketplace_anuncios").update({ pendente: false }).in("id", semMudanca);
  return { enviados, erros };
}

/** Depois de venda no PDV, baixa de pedido etc.: envia o pendente das lojas com envio automático. */
export async function empurrarEstoquePendente(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.from("marketplace_conexoes").select("*").eq("estoque_auto", true);
  if (error || !data?.length) return;
  for (const conexao of data as ConexaoShopee[]) {
    try {
      await enviarEstoqueConexao(supabase, conexao);
    } catch (e) {
      console.error("[estoque shopee]", e instanceof Error ? e.message : e);
    }
  }
}

/** Kits (0058) não têm saldo em armazém: valem quantos dá para montar com o saldo dos itens. */
async function comKits(supabase: SupabaseClient, userId: string, saldos: Map<string, number>): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("produtos").select("*").eq("user_id", userId).eq("e_kit", true);
  if (error || !data?.length) return saldos;
  for (const k of data as { id: string; insumos: { produtoId?: string | null; quantidade: number }[] | null }[]) {
    const itens = (k.insumos ?? []).filter((i) => i.produtoId && i.quantidade > 0);
    if (!itens.length) continue;
    saldos.set(k.id, Math.max(0, Math.min(...itens.map((i) => Math.floor((saldos.get(i.produtoId as string) ?? 0) / Math.ceil(i.quantidade))))));
  }
  return saldos;
}
