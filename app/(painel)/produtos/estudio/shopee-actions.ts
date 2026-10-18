"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { validar, escolhasShopeeSchema, rascunhoIdSchema } from "@/lib/validacao";
import { carregarContextoRascunho, caminhoDoUsuario, gravarEstado, type ContextoRascunho } from "@/lib/estudio/servidor";
import { plataformaDa } from "@/lib/marketplace/conexao-api";
import { tokenDaConexao, type ConexaoShopee } from "@/lib/marketplace/tokens";
import type { CredenciaisShopee } from "@/lib/marketplace/shopee-api";
import {
  apagarItem,
  atributosDaCategoria,
  canaisDeFrete,
  conferirEntradaCriacao,
  criarItem,
  desativarItem,
  enviarImagem,
  estaNaoListado,
  listarCategorias,
  montarCorpoAddItem,
  statusDoItem,
  traduzirErroShopee,
  MAX_IMAGENS,
  type AtributoShopee,
  type CanalFrete,
  type CategoriaShopee,
} from "@/lib/marketplace/shopee-criar";

const MAX_IMAGEM_BYTES = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];

/** Árvore de categorias por loja, guardada por alguns minutos: a chamada devolve a árvore inteira. */
const cacheCategorias = new Map<number, { em: number; lista: CategoriaShopee[] }>();
const VALIDADE_CACHE_MS = 10 * 60 * 1000;

interface Preparo {
  ctx: ContextoRascunho;
  supabase: Awaited<ReturnType<typeof createClient>>;
  c: CredenciaisShopee;
  token: string;
  shopId: number;
}

/**
 * Contexto + credenciais da loja Shopee ligada ao perfil do rascunho. Só usuário logado (RLS):
 * a conexão e os tokens são lidos com a sessão dele, nunca com a chave de serviço.
 */
async function preparar(rascunhoId: string): Promise<Preparo> {
  const supabase = await createClient();
  const ctx = await carregarContextoRascunho(supabase, rascunhoId);
  if (!ctx.perfil) throw new Error("Escolha um perfil da loja ao abrir o estúdio: é ele que diz em qual loja o anúncio será criado.");
  if (ctx.perfil.plataforma !== "shopee") throw new Error("Criar o anúncio direto na plataforma só funciona com a Shopee por enquanto.");
  if (!ctx.perfil.lojaId) throw new Error("Vincule o perfil a uma loja já conectada à Shopee (em Anúncio Infinito › Configurações › Perfil, campo “Loja do Painel”).");
  const { data: conexao } = await supabase.from("marketplace_conexoes").select("*").eq("loja_id", ctx.perfil.lojaId).maybeSingle();
  if (!conexao) throw new Error("Esta loja ainda não está conectada à Shopee. Conecte em Configurações › Canais de venda.");
  if (plataformaDa(conexao as ConexaoShopee) !== "shopee") throw new Error("A loja vinculada ao perfil não é da Shopee.");
  const { c, token, shopId } = await tokenDaConexao(supabase, conexao as ConexaoShopee);
  return { ctx, supabase, c, token, shopId };
}

/** Erros da Shopee viram orientação; os nossos passam como estão. */
function traduzir(e: unknown): never {
  const msg = e instanceof Error ? e.message : "Erro desconhecido.";
  throw new Error(/^Shopee:/i.test(msg) ? traduzirErroShopee(msg) : msg);
}

// ---------- Somente leitura ----------

export interface ResultadoSonda {
  categoriasRaiz: number;
  canais: CanalFrete[];
}

/**
 * Sonda SOMENTE DE LEITURA: pede as categorias e os canais de frete da loja. Não cria nem altera
 * nada. Se negar por permissão, o app da Shopee não pode escrever produto e o envio fica parado.
 */
export async function verificarShopee(entrada: unknown) {
  return comResultado(async (): Promise<ResultadoSonda> => {
    const v = validar(rascunhoIdSchema, entrada);
    try {
      const { c, token, shopId } = await preparar(v.rascunho_id);
      const [categorias, canais] = await Promise.all([listarCategorias(c, token, shopId), canaisDeFrete(c, token, shopId)]);
      cacheCategorias.set(shopId, { em: Date.now(), lista: categorias });
      return { categoriasRaiz: categorias.filter((x) => x.paiId === 0).length, canais: canais.filter((x) => x.habilitado) };
    } catch (e) {
      return traduzir(e);
    }
  });
}

export async function categoriasFilhas(entrada: unknown) {
  return comResultado(async (): Promise<CategoriaShopee[]> => {
    const v = validar(rascunhoIdSchema.extend({ pai_id: z.number().int().min(0) }), entrada);
    try {
      const { c, token, shopId } = await preparar(v.rascunho_id);
      let cache = cacheCategorias.get(shopId);
      if (!cache || Date.now() - cache.em > VALIDADE_CACHE_MS) {
        cache = { em: Date.now(), lista: await listarCategorias(c, token, shopId) };
        cacheCategorias.set(shopId, cache);
      }
      return cache.lista.filter((x) => x.paiId === v.pai_id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } catch (e) {
      return traduzir(e);
    }
  });
}

export async function atributosDaCategoriaShopee(entrada: unknown) {
  return comResultado(async (): Promise<AtributoShopee[]> => {
    const v = validar(rascunhoIdSchema.extend({ category_id: z.number().int().positive() }), entrada);
    try {
      const { c, token, shopId } = await preparar(v.rascunho_id);
      return await atributosDaCategoria(c, token, shopId, v.category_id);
    } catch (e) {
      return traduzir(e);
    }
  });
}

// ---------- Escolhas (só gravam no rascunho) ----------

export async function salvarEscolhasShopee(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ escolhas: escolhasShopeeSchema }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    return gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { shopee: v.escolhas });
  });
}

// ---------- Criação ----------

export interface ResultadoCriacao {
  itemId: number;
  status: string;
  naoListado: boolean;
}

async function baixarImagemDoUsuario(ctx: ContextoRascunho, caminho: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!caminhoDoUsuario(ctx.userId, caminho) || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Imagem fora da sua conta. Gere a capa de novo.");
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${caminho}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!r?.ok || !TIPOS_IMAGEM.includes(mime)) throw new Error("Não consegui abrir uma das capas guardadas.");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_IMAGEM_BYTES) throw new Error("Uma das imagens passa de 5 MB.");
  return { bytes, mime };
}

/**
 * Cria o anúncio na Shopee como NÃO LISTADO. O usuário precisa ter confirmado (`confirmo: true`,
 * vindo de um diálogo que explica o que acontece). Depois de criar, o servidor LÊ o item e confere
 * o status real: se a Shopee o deixou listado, chama `unlist_item` na hora e avisa. O id do item é
 * gravado no rascunho assim que existe, então uma falha no meio nunca o perde.
 */
export async function criarNaoListadoShopee(entrada: unknown) {
  return comResultado(async (): Promise<ResultadoCriacao> => {
    const v = validar(rascunhoIdSchema.extend({ confirmo: z.literal(true, { message: "Confirme para criar o anúncio na Shopee." }) }), entrada);
    const { ctx, supabase, c, token, shopId } = await preparar(v.rascunho_id);
    const est = ctx.rascunho.estado;
    // Qualquer item já criado por este rascunho bloqueia: mesmo o que ficou com erro pode estar no ar.
    if (est.itemShopee) throw new Error(`Este rascunho já criou o item ${est.itemShopee.itemId} na Shopee${est.itemShopee.erro ? " (e houve um problema com ele)" : ""}. Confira no Seller Centre e, se precisar, use “Apagar da Shopee” antes de criar de novo.`);

    const capas = (est.capas ?? []).filter((x) => x.veredito === "aprovada" && x.finalPath).slice(0, MAX_IMAGENS);
    const p = ctx.produto;
    const base = {
      titulo: ctx.rascunho.titulo ?? "",
      descricao: ctx.rascunho.descricao ?? "",
      preco: p.precoVenda,
      pesoG: p.pesoG,
      dimensoesCm: { altura: p.alturaCm, largura: p.larguraCm, comprimento: p.comprimentoCm },
      categoryId: est.shopee?.categoryId ?? null,
      atributos: est.shopee?.atributos ?? [],
      obrigatorios: est.shopee?.obrigatorios ?? [],
      canais: est.shopee?.canais ?? [],
      sku: p.sku,
      estoque: p.estoque,
    };
    const falta = conferirEntradaCriacao({ ...base, imagens: capas.map((x) => x.finalPath as string) });
    if (falta.length) throw new Error(falta.join(" "));

    let itemId: number | null = null;
    try {
      const ids: string[] = [];
      for (const capa of capas) {
        const img = await baixarImagemDoUsuario(ctx, capa.finalPath as string);
        ids.push(await enviarImagem(c, token, shopId, img.bytes, img.mime, "capa.png"));
      }
      itemId = await criarItem(c, token, shopId, montarCorpoAddItem({ ...base, imagens: ids }));

      // O id vale ouro: grava já, antes de qualquer outra chamada.
      let estado = await gravarEstado(supabase, v.rascunho_id, est, { itemShopee: { itemId, status: "CRIADO", criadoEm: new Date().toISOString() } });

      let status = await statusDoItem(c, token, shopId, itemId);
      if (!estaNaoListado(status)) {
        // A Shopee não o deixou não listado. Tira do ar agora e confere de novo.
        await desativarItem(c, token, shopId, itemId);
        status = await statusDoItem(c, token, shopId, itemId);
        if (!estaNaoListado(status)) {
          const erro = `O item ${itemId} ficou com status ${status ?? "desconhecido"} na Shopee e não consegui deixá-lo não listado. Abra o Seller Centre e tire-o do ar agora.`;
          estado = await gravarEstado(supabase, v.rascunho_id, estado, { itemShopee: { itemId, status: status ?? "DESCONHECIDO", criadoEm: new Date().toISOString(), erro } });
          throw new Error(erro);
        }
      }
      await gravarEstado(supabase, v.rascunho_id, estado, { itemShopee: { itemId, status: status as string, criadoEm: estado.itemShopee?.criadoEm ?? new Date().toISOString() } });
      return { itemId, status: status as string, naoListado: true };
    } catch (e) {
      if (itemId && e instanceof Error && /ficou com status/.test(e.message)) throw e;
      return traduzir(e);
    }
  });
}

/** Apaga da Shopee o item que ESTE rascunho criou (limpeza de teste ou de criação incompleta). */
export async function removerItemShopee(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ confirmo: z.literal(true, { message: "Confirme para apagar o item na Shopee." }) }), entrada);
    const { ctx, supabase, c, token, shopId } = await preparar(v.rascunho_id);
    const item = ctx.rascunho.estado.itemShopee;
    if (!item) throw new Error("Este rascunho não criou nenhum item na Shopee.");
    try {
      await apagarItem(c, token, shopId, item.itemId);
    } catch (e) {
      return traduzir(e);
    }
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { itemShopee: undefined });
  });
}
