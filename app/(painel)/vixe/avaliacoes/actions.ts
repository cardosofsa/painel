"use server";

import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { validar, respostaAvaliacaoSchema, type RespostaAvaliacaoInput } from "@/lib/validacao";
import { credenciaisShopee } from "@/lib/marketplace/shopee-api";
import { buscarAvaliacoes, ordenarAvaliacoes, responderAvaliacao, type AvaliacaoShopee } from "@/lib/marketplace/shopee-avaliacoes";
import { plataformaDa } from "@/lib/marketplace/conexao-api";
import { tokenDaConexao, type ConexaoShopee } from "@/lib/marketplace/tokens";
import type { ProdutoTextoIA } from "@/lib/ia/prompts-textos";

export interface AvaliacaoComProduto extends AvaliacaoShopee {
  /** Nome do anúncio na Shopee (lido na sincronização de estoque, 0049). */
  anuncio: string | null;
  /** Produto do Sertão ligado ao anúncio: vai para a IA como contexto. */
  produto: ProdutoTextoIA | null;
}

export interface LojaAvaliacoes {
  conexaoId: string;
  loja: string;
  avaliacoes: AvaliacaoComProduto[];
  erro: string | null;
}

/** Avaliações recentes de cada loja Shopee conectada à API, já com o produto do Sertão. */
export async function carregarAvaliacoes() {
  return comResultado(async (): Promise<{ apiLigada: boolean; lojas: LojaAvaliacoes[] }> => {
    if (!credenciaisShopee()) return { apiLigada: false, lojas: [] };
    const supabase = await createClient();
    const { data, error } = await supabase.from("marketplace_conexoes").select("*");
    if (error) return { apiLigada: true, lojas: [] };
    const conexoes = ((data ?? []) as ConexaoShopee[]).filter((c) => plataformaDa(c) === "shopee");
    if (!conexoes.length) return { apiLigada: true, lojas: [] };

    const [lojasRes, anunciosRes, produtosRes] = await Promise.all([
      supabase.from("lojas_canal").select("id, nome"),
      supabase.from("marketplace_anuncios").select("loja_id, item_id, nome, produto_id"),
      supabase.from("produtos").select("id, nome, descricao, preco_venda, garantia_dias, estoque"),
    ]);
    const nomeLoja = new Map((lojasRes.data ?? []).map((l) => [l.id as string, l.nome as string]));
    const produtos = new Map(
      (produtosRes.data ?? []).map((p) => [
        p.id as string,
        {
          nome: p.nome as string,
          descricao: (p.descricao as string | null) ?? null,
          preco: Number(p.preco_venda) || null,
          garantiaDias: (p.garantia_dias as number | null) ?? null,
          emEstoque: Number(p.estoque) > 0,
        },
      ]),
    );
    const anuncio = new Map<string, { nome: string | null; produtoId: string | null }>();
    for (const a of anunciosRes.data ?? []) {
      const chave = `${a.loja_id}:${a.item_id}`;
      if (!anuncio.has(chave) || (!anuncio.get(chave)!.produtoId && a.produto_id))
        anuncio.set(chave, { nome: (a.nome as string | null) ?? null, produtoId: (a.produto_id as string | null) ?? null });
    }

    const lojas: LojaAvaliacoes[] = [];
    for (const c of conexoes) {
      const base = { conexaoId: c.id, loja: nomeLoja.get(c.loja_id) ?? "Loja Shopee" };
      try {
        const { c: cred, token, shopId } = await tokenDaConexao(supabase, c);
        const lista = ordenarAvaliacoes(await buscarAvaliacoes(cred, token, shopId, 100));
        lojas.push({
          ...base,
          erro: null,
          avaliacoes: lista.map((av) => {
            const an = anuncio.get(`${c.loja_id}:${av.itemId}`);
            const p = an?.produtoId ? produtos.get(an.produtoId) : undefined;
            return { ...av, anuncio: an?.nome ?? null, produto: p ?? (an?.nome ? { nome: an.nome } : null) };
          }),
        });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : "Erro ao ler as avaliações").replace(/^Shopee: /, "");
        lojas.push({ ...base, avaliacoes: [], erro: msg });
      }
    }
    return { apiLigada: true, lojas };
  });
}

/** Publica a resposta na Shopee (uma por avaliação; a Shopee recusa a segunda). */
export async function responderAvaliacaoShopee(dados: RespostaAvaliacaoInput) {
  return comResultado(async () => {
    const v = validar(respostaAvaliacaoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.from("marketplace_conexoes").select("*").eq("id", v.conexaoId).maybeSingle();
    if (error || !data) throw new Error("Loja não encontrada. Conecte de novo em Configurações → Canais de venda.");
    const { c, token, shopId } = await tokenDaConexao(supabase, data as ConexaoShopee);
    try {
      await responderAvaliacao(c, token, shopId, v.commentId, v.texto);
    } catch (e) {
      throw new Error((e instanceof Error ? e.message : "A Shopee recusou a resposta").replace(/^Shopee: /, "A Shopee recusou: "));
    }
  });
}
