"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, perfilMarcaSchema, memoriaMarcaSchema, salvarFichaSchema, PLATAFORMAS_MARCA_IDS } from "@/lib/validacao";
import { gerarFichaPelasCapasIA } from "@/lib/ia/gerar";
import { regrasDaPlataforma } from "@/lib/marca/plataformas";
import { presetPorId } from "@/lib/conformidade/termos";
import { buscarEmLotes } from "@/lib/lotes";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import { rankearAnuncios, type PedidoRanking } from "@/lib/marketplace/ranking-anuncios";
import { apiDaConexao } from "@/lib/marketplace/conexao-api";
import type { ConexaoShopee } from "@/lib/marketplace/tokens";
import { itensParaLer, linhasDeExemplo } from "@/lib/marca/exemplos-loja";

const PATH = "/anuncio/infinito";
const SEM_MIGRACAO = "O padrão da loja precisa da migração 0098. Aplique no Supabase e recarregue.";
const SEM_0103 = "Conjuntos ligados e termos que bloqueiam precisam da migração 0103. Aplique no Supabase e recarregue (ou tire esses termos para salvar o resto).";
const faltaColuna = (code?: string) => code === "PGRST204" || code === "42703";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "42883";

/** Sem repetidos, ignorando caixa. */
const semRepetidos = (lista: string[]) => [...new Map(lista.map((t) => [t.toLowerCase(), t])).values()];

async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  return { supabase, userId: data.user.id };
}

/** Logo e capas só valem se estiverem na pasta do próprio usuário no Storage (o bucket é público, o caminho vem do cliente). */
function caminhoDoUsuario(userId: string, caminho: string): boolean {
  return caminho.startsWith(`${userId}/`) && !caminho.includes("..");
}

function checar(erro: { message: string; code?: string } | null) {
  if (!erro) return;
  if (faltaMigracao(erro.code)) throw new Error(SEM_MIGRACAO);
  lancarErroSupabase(erro);
}

// ---------- Perfil ----------

export async function salvarPerfilMarca(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string }> => {
    const v = validar(perfilMarcaSchema, entrada);
    const { supabase, userId } = await sessao();
    for (const c of [v.logo_path, ...v.referencias]) {
      if (c && !caminhoDoUsuario(userId, c)) throw new Error("Envie as imagens por esta tela (só arquivos da sua conta).");
    }
    const dados = {
      nome: v.nome,
      plataforma: v.plataforma,
      loja_id: v.loja_id,
      nicho: v.nicho?.trim() || null,
      link_loja: v.link_loja?.trim() || null,
      logo_path: v.logo_path || null,
      referencias: v.referencias,
      termos_proibidos: semRepetidos(v.termos_proibidos),
      atualizado_em: new Date().toISOString(),
    };
    const termos = { presets: [...new Set(v.presets)].filter((id) => presetPorId(id)), presets_gravidade: v.presets_gravidade, termos_bloqueados: semRepetidos(v.termos_bloqueados) };
    const usaTermos = termos.presets.length > 0 || termos.termos_bloqueados.length > 0;
    const gravar = (linha: typeof dados & Partial<typeof termos>) =>
      v.id ? supabase.from("perfis_marca").update(linha).eq("id", v.id).select("id").single() : supabase.from("perfis_marca").insert(linha).select("id").single();

    let r = await gravar({ ...dados, ...termos });
    // Sem a 0103 as colunas de termos não existem: grava o resto, a não ser que ele tenha usado algo delas.
    if (r.error && faltaColuna(r.error.code)) {
      if (usaTermos) throw new Error(SEM_0103);
      r = await gravar(dados);
    }
    checar(r.error);
    revalidatePath(PATH);
    return { id: (r.data?.id as string | undefined) ?? v.id ?? "" };
  });
}

export async function removerPerfilMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.from("perfis_marca").delete().eq("id", v);
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Memória ----------

export async function adicionarMemoriaMarca(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(memoriaMarcaSchema, entrada);
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").insert(v);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function alternarMemoriaMarca(id: string, ativo: boolean) {
  return comResultado(async () => {
    const v = validar(z.object({ id: z.string().uuid(), ativo: z.boolean() }), { id, ativo });
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").update({ ativo: v.ativo }).eq("id", v.id);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function removerMemoriaMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").delete().eq("id", v);
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Direção da IA (0109) ----------

const SEM_0109 = "As instruções e os exemplos da IA precisam da migração 0109. Aplique no Supabase e recarregue.";
const textoInstrucao = z.string().trim().max(2000, "Até 2.000 caracteres").nullable();

/** Instruções de base do perfil: entram em toda geração de título e de descrição dele. */
export async function salvarDirecaoMarca(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(z.object({ perfil_id: z.string().uuid(), instrucoes_titulo: textoInstrucao, instrucoes_descricao: textoInstrucao }), entrada);
    const { supabase } = await sessao();
    const { error } = await supabase
      .from("perfis_marca")
      .update({ instrucoes_titulo: v.instrucoes_titulo || null, instrucoes_descricao: v.instrucoes_descricao || null, atualizado_em: new Date().toISOString() })
      .eq("id", v.perfil_id);
    if (error && faltaColuna(error.code)) throw new Error(SEM_0109);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function alternarExemploMarca(id: string, ativo: boolean) {
  return comResultado(async () => {
    const v = validar(z.object({ id: z.string().uuid(), ativo: z.boolean() }), { id, ativo });
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_exemplos").update({ ativo: v.ativo }).eq("id", v.id);
    if (error && faltaMigracao(error.code)) throw new Error(SEM_0109);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function removerExemploMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_exemplos").delete().eq("id", v);
    if (error && faltaMigracao(error.code)) throw new Error(SEM_0109);
    checar(error);
    revalidatePath(PATH);
  });
}

/** Janela de vendas usada para escolher quais anúncios ler. */
const DIAS_VENDAS_EXEMPLOS = 90;

/**
 * Lê título e descrição dos anúncios que mais vendem na loja ligada ao perfil (Shopee ou
 * Mercado Livre) e guarda como exemplos dele, no lugar da leitura anterior. A IA passa a
 * escrever no estilo que a loja já usa. Sob demanda: é chamada à API da plataforma.
 */
export async function lerAnunciosDaLoja(perfilId: string) {
  return comResultado(async (): Promise<{ anuncios: number; titulos: number; descricoes: number }> => {
    const v = validar(z.string().uuid(), perfilId);
    const { supabase } = await sessao();
    const { data: perfil, error: erroPerfil } = await supabase.from("perfis_marca").select("id, loja_id").eq("id", v).maybeSingle();
    checar(erroPerfil);
    if (!perfil) throw new Error("Perfil não encontrado.");
    if (!perfil.loja_id) throw new Error("Ligue este perfil a uma loja (aba Perfil) para a IA ler os anúncios dela.");
    const loja = perfil.loja_id as string;

    const { data: conexao } = await supabase.from("marketplace_conexoes").select("*").eq("loja_id", loja).maybeSingle();
    if (!conexao) throw new Error("A loja deste perfil não está conectada à Shopee nem ao Mercado Livre. Conecte em Configurações › Canais de venda.");

    const [dados, anunciosRes] = await Promise.all([
      carregarPedidosMarketplace(supabase, DIAS_VENDAS_EXEMPLOS),
      buscarEmLotes((de, ate) => supabase.from("marketplace_anuncios").select("*", { count: "exact" }).eq("loja_id", loja).order("id").range(de, ate), { maximo: 20000 }),
    ]);
    checar(anunciosRes.error);
    const anuncios = (anunciosRes.data ?? []) as { id: string; item_id: number; loja_id: string; sku_principal?: string | null; nome_item?: string | null; nome?: string | null }[];
    if (anuncios.length === 0) throw new Error("Ainda não há anúncios desta loja no Painel. Sincronize a loja em Vendas › Marketplace e tente de novo.");

    const pedidos: PedidoRanking[] = dados.pedidos
      .filter((p) => p.loja_id === loja)
      .map((p) => ({
        loja_id: p.loja_id,
        status: p.status,
        criado_em_plataforma: p.criado_em_plataforma,
        lucro: p.lucro,
        custo_incompleto: p.custo_incompleto,
        itens: p.pedidos_marketplace_itens.map((i) => ({ sku_principal: i.sku_principal ?? null, nome: i.nome, variacao: i.variacao, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      }));
    const fim = new Date();
    const inicio = new Date(fim.getTime() - DIAS_VENDAS_EXEMPLOS * 86_400_000);
    const linhas = rankearAnuncios(
      pedidos,
      anuncios.map((a) => ({ id: a.id, loja_id: a.loja_id, sku_principal: a.sku_principal ?? null, nome_item: a.nome_item ?? null, nome: a.nome ?? null, imagem_url: null, link: null })),
      inicio,
      fim,
      "unidades",
    );
    const itens = itensParaLer(linhas, anuncios);

    const api = await apiDaConexao(supabase, conexao as ConexaoShopee);
    const textos = await api.buscarTextos(itens);
    const novas = linhasDeExemplo(v, textos);
    if (novas.length === 0) throw new Error("Não consegui ler o texto dos anúncios da loja. Tente de novo mais tarde.");

    // Troca a leitura anterior inteira: o que saiu da loja deixa de ser exemplo.
    const { error: erroApagar } = await supabase.from("marca_exemplos").delete().eq("perfil_id", v).eq("origem", "loja");
    if (erroApagar && faltaMigracao(erroApagar.code)) throw new Error(SEM_0109);
    checar(erroApagar);
    const { error } = await supabase.from("marca_exemplos").insert(novas);
    checar(error);
    revalidatePath(PATH);
    return { anuncios: textos.length, titulos: novas.filter((n) => n.tipo === "titulo").length, descricoes: novas.filter((n) => n.tipo === "descricao").length };
  });
}

// ---------- Ficha de Direção de Arte ----------

export async function salvarFichaMarca(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string; versao: number }> => {
    const v = validar(salvarFichaSchema, entrada);
    const { supabase } = await sessao();
    const { data, error } = await supabase.rpc("salvar_ficha_marca", {
      p_perfil_id: v.perfil_id,
      p_tipo_imagem: v.tipo_imagem,
      p_dados: v.dados,
      p_origem: v.origem,
      p_nota: v.nota,
    });
    checar(error);
    const linha = (Array.isArray(data) ? data[0] : data) as { id: string; versao: number } | null;
    if (!linha) throw new Error("Não foi possível salvar a ficha.");
    revalidatePath(PATH);
    return { id: linha.id, versao: Number(linha.versao) };
  });
}

export async function ativarVersaoFichaMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.rpc("ativar_ficha_marca", { p_ficha_id: v });
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Aprender das capas ----------

const MAX_MONTAGEM_BYTES = 4 * 1024 * 1024;
const TIPOS_IMAGEM_IA = ["image/jpeg", "image/png", "image/webp"];

const aprenderSchema = z.object({
  url: z.string().url().max(500),
  plataforma: z.enum(PLATAFORMAS_MARCA_IDS),
  nicho: z.string().trim().max(120).nullable(),
  capas: z.number().int().min(1).max(8),
});

/**
 * A IA olha a montagem das capas (enviada pelo navegador ao Storage) e PROPÕE a ficha. NÃO grava
 * nada: a tela mostra a proposta e o usuário aprova campo a campo. Só baixa imagem do Storage
 * do próprio projeto, na pasta do usuário.
 */
export async function aprenderDasCapas(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(aprenderSchema, entrada);
    const { supabase, userId } = await sessao();
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${userId}/`;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !v.url.startsWith(base) || v.url.includes("..")) throw new Error("Envie as capas por esta tela primeiro (só imagens da sua conta).");

    const r = await fetch(v.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r?.ok || !TIPOS_IMAGEM_IA.includes(mime)) throw new Error("Não consegui abrir a imagem (use JPG, PNG ou WebP).");
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_MONTAGEM_BYTES) throw new Error("Imagem grande demais para a IA (máx. 4 MB).");

    const g = await gerarFichaPelasCapasIA(
      supabase,
      { plataforma: regrasDaPlataforma(v.plataforma).nome, nicho: v.nicho || null, capas: v.capas },
      { base64: bytes.toString("base64"), mime, hash: createHash("sha256").update(bytes).digest("hex") },
    );
    if (!g.ok) throw new Error(g.erro);
    return g.dado;
  });
}
