"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { validar } from "@/lib/validacao";
import { carregarAnalise, contextoDaAnalise } from "@/lib/analise-servidor";
import { gerarAnaliseAnuncioIA, gerarAnaliseCapaIA } from "@/lib/ia/gerar";
import { ErroIA } from "@/lib/ia/erro";
import { regrasAtivas, temBloqueio, verificarTextos } from "@/lib/conformidade/termos";
import { tokenDaConexao, type ConexaoShopee } from "@/lib/marketplace/tokens";
import { plataformaDa } from "@/lib/marketplace/conexao-api";
import { buscarImagensItem } from "@/lib/marketplace/shopee-api";
import { lerRascunhoAberto } from "@/lib/estudio/servidor";

const alvoSchema = z.object({ anuncio_id: z.string().uuid() });
const MAX_IMAGEM = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
/** Só baixa capa destes domínios (CDN da Shopee e do Mercado Livre): nada de URL arbitrária. */
const HOSTS_IMAGEM = [/\.susercontent\.com$/i, /(^|\.)shopee\.com\.br$/i, /\.mlstatic\.com$/i];

async function dados(anuncioId: string) {
  const supabase = await createClient();
  const d = await carregarAnalise(supabase, anuncioId);
  if (d === null) throw new Error("Anúncio não encontrado.");
  if (d === "sem_produto") throw new Error("Ligue o anúncio a um produto antes de analisar.");
  return { supabase, d };
}

/** Diagnóstico, 3 títulos e estratégia: a IA narra os números calculados aqui. */
export async function gerarAnaliseTextoIA(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(alvoSchema.extend({ total_imagens: z.number().int().min(0).max(30).nullable() }), entrada);
    const { supabase, d } = await dados(v.anuncio_id);
    const r = await gerarAnaliseAnuncioIA(supabase, contextoDaAnalise(d, v.total_imagens), d.perfil?.termosProibidos ?? []);
    return { narracao: r.narracao, doCache: r.doCache, usadas: r.usadas, limite: r.limite, origem: r.origem };
  });
}

/** Lista completa de imagens do item, lida da Shopee com o token da conexão (não testado na loja real). */
export async function lerImagensDoAnuncio(entrada: unknown) {
  return comResultado(async (): Promise<string[]> => {
    const v = validar(alvoSchema, entrada);
    const { supabase, d } = await dados(v.anuncio_id);
    const { data: conexao } = await supabase.from("marketplace_conexoes").select("*").eq("loja_id", d.anuncio.lojaId).maybeSingle();
    if (!conexao) throw new Error("Esta loja não está conectada. Conecte em Configurações › Canais de venda.");
    if (plataformaDa(conexao as ConexaoShopee) !== "shopee") throw new Error("Ler as imagens só funciona com a Shopee por enquanto.");
    const { c, token, shopId } = await tokenDaConexao(supabase, conexao as ConexaoShopee);
    try {
      return await buscarImagensItem(c, token, shopId, d.anuncio.itemId);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message.replace(/^Shopee:\s*/i, "A Shopee respondeu: ") : "Não foi possível ler as imagens.");
    }
  });
}

/** A capa (1 geração da cota de hoje; a mesma imagem de novo sai do cache, sem custo). */
export async function analisarCapaIA(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(alvoSchema, entrada);
    const { supabase, d } = await dados(v.anuncio_id);
    const url = d.anuncio.imagemUrl;
    if (!url) throw new Error("Este anúncio não tem capa sincronizada.");
    let host: string;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") throw new Error();
      host = u.hostname;
    } catch {
      throw new Error("Endereço da capa inválido.");
    }
    if (!HOSTS_IMAGEM.some((h) => h.test(host))) throw new Error("A capa não está num endereço da plataforma; não consigo baixá-la com segurança.");
    const resp = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error" }).catch(() => null);
    const mime = (resp?.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!resp?.ok || !TIPOS.includes(mime)) throw new Error("Não consegui baixar a capa agora. Tente de novo.");
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (bytes.length > MAX_IMAGEM) throw new Error("A capa passa de 5 MB.");
    try {
      const r = await gerarAnaliseCapaIA(
        supabase,
        { titulo: d.anuncio.titulo, plataforma: d.plataforma.nome, capaFundoBranco: d.plataforma.capaFundoBranco, ficha: d.perfil?.fichaResumo ?? null },
        { base64: bytes.toString("base64"), mime, hash: createHash("sha256").update(bytes).digest("hex") },
      );
      return { capa: r.capa, doCache: r.doCache, usadas: r.usadas, limite: r.limite, origem: r.origem };
    } catch (e) {
      if (e instanceof ErroIA && e.codigo === "sem_chave") throw new Error("Nenhuma IA disponível para a sua conta.");
      throw e;
    }
  });
}

/**
 * "Usar este título no Anúncio Infinito": abre (ou cria) o rascunho deste produto no perfil da
 * loja e grava o título, depois da mesma conferência de termos do estúdio. Devolve o id para a
 * tela abrir o rascunho. Nada é aplicado sem este clique.
 */
export async function usarTituloNoInfinito(entrada: unknown) {
  return comResultado(async (): Promise<string> => {
    const v = validar(alvoSchema.extend({ titulo: z.string().trim().min(3).max(200) }), entrada);
    const { supabase, d } = await dados(v.anuncio_id);
    if (v.titulo.length > d.plataforma.limiteTitulo) throw new Error(`O título passa de ${d.plataforma.limiteTitulo} caracteres.`);
    const violacoes = verificarTextos([{ campo: "Título", texto: v.titulo, tipo: "texto" }], regrasAtivas([], d.perfil?.termosProibidos ?? []));
    if (temBloqueio(violacoes)) throw new Error(`O título tem algo que as plataformas costumam barrar: “${violacoes[0].trecho}”.`);
    const perfilId = d.perfil?.id ?? null;
    let consulta = supabase.from("anuncio_rascunhos").select("id").eq("produto_id", d.ajuste.produto.id).order("atualizado_em", { ascending: false }).limit(1);
    consulta = perfilId ? consulta.eq("perfil_id", perfilId) : consulta.is("perfil_id", null);
    const { data: achado } = await consulta;
    let id = (achado?.[0]?.id as string | undefined) ?? null;
    if (!id) {
      const { data: novo, error } = await supabase.from("anuncio_rascunhos").insert({ produto_id: d.ajuste.produto.id, perfil_id: perfilId, titulo: v.titulo }).select("id").single();
      if (error || !novo) throw new Error("Não foi possível abrir o rascunho.");
      id = novo.id as string;
    } else {
      const { error } = await supabase.from("anuncio_rascunhos").update({ titulo: v.titulo, atualizado_em: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error("Não foi possível gravar o título.");
    }
    if (!(await lerRascunhoAberto(supabase, id))) throw new Error("Rascunho não encontrado.");
    revalidatePath("/anuncio");
    return id;
  });
}
