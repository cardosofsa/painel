"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  produtoSchema,
  grupoProdutoSchema,
  imagemProdutoSchema,
  acaoEmMassaProdutosSchema,
} from "@/lib/validacao";
import { gerarComIA, gerarProdutoPelaFotoIA } from "@/lib/ia/gerar";
import { comResultado } from "@/lib/acao";
import type { ComponenteKit } from "@/lib/pricing";

const PATH = "/produtos";

export interface ProdutoInput {
  sku: string;
  nome: string;
  categoria_id: string | null;
  fornecedor_id: string | null;
  armazem_id: string | null;
  /** Valor do produto — junto com `insumos`, compõe `produtos.custo` (derivado por
   * trigger desde a 0029; nunca é mandado direto pro banco). */
  custo_base: number;
  insumos: ComponenteKit[];
  preco_venda: number;
  /** Preço de atacado; null = "A consultar" no catálogo de atacado. */
  preco_atacado: number | null;
  descricao: string | null;
  codigo_barras: string | null;
  imagem_url: string | null;
  estoque: number;
  estoque_minimo: number;
  saida_media_semanal: number;
  /** Garantia padrão em dias; null = sem garantia. Vai para o carrinho do PDV (editável). */
  garantia_dias: number | null;
  /** Palavras-chave da IA (0037). Ausente = não mexe na coluna. */
  palavras_chave?: string[] | null;
  /** Envio (0041). */
  peso_g?: number | null;
  altura_cm?: number | null;
  largura_cm?: number | null;
  comprimento_cm?: number | null;
  ativo: boolean;
  /** 0058: vende como kit (estoque calculado pelos componentes). */
  e_kit?: boolean;
  grupo_id: string | null;
  variante_nome: string | null;
  loja_ids: string[];
}

/**
 * Sem nenhuma medida preenchida, as colunas de envio nem vão no insert/update: antes da
 * 0041 elas não existem, e mandar `null` nelas derrubaria o cadastro de produto inteiro.
 */
function semEnvioVazio<T extends Record<string, unknown>>(p: T): T {
  const chaves = ["peso_g", "altura_cm", "largura_cm", "comprimento_cm"] as const;
  if (chaves.some((k) => p[k] != null)) return p;
  const copia = { ...p };
  for (const k of chaves) delete copia[k];
  return copia;
}

/**
 * Kit (0058) não tem estoque próprio: o número do formulário NÃO vai para o banco — gravar
 * o estoque de um kit seria lido como venda/entrada e mexeria nos componentes.
 */
function paraGravar<T extends { e_kit?: boolean; estoque?: number }>(p: T, edicao: boolean): T {
  if (!p.e_kit) return p;
  const copia = { ...p };
  if (edicao) delete copia.estoque;
  else copia.estoque = 0;
  return copia;
}

function revalidateTudo() {
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  revalidatePath("/precificacao");
  revalidatePath("/compras");
  revalidatePath("/pdv");
  revalidatePath("/catalogo");
}

/** Grupo de variantes: só o nome comercial compartilhado. Estoque/preço/SKU seguem no produto. */
export async function criarGrupoProduto(nome: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("produto_grupos")
      .insert(validar(grupoProdutoSchema, { nome, descricao: null, imagem_url: null, categoria_id: null }))
      .select("id, nome")
      .single();
    if (error || !data) lancarErroSupabase(error ?? { message: "Erro ao criar grupo" });
    revalidateTudo();
    return data;
  });
}

async function sincronizarLojasProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaIds: string[],
) {
  const { error: erroDelete } = await supabase.from("produto_lojas").delete().eq("produto_id", produtoId);
  if (erroDelete) lancarErroSupabase(erroDelete);

  if (lojaIds.length > 0) {
    const linhas = lojaIds.map((loja_id) => ({ produto_id: produtoId, loja_id }));
    const { error: erroInsert } = await supabase.from("produto_lojas").insert(linhas);
    if (erroInsert) lancarErroSupabase(erroInsert);
  }
}

export async function criarProduto(dados: ProdutoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { loja_ids, ...produto } = validar(produtoSchema, dados);
    let { data, error } = await supabase.from("produtos").insert(semEnvioVazio(paraGravar(produto, false))).select("id").single();
    // Sem a 0058 a coluna e_kit não existe: grava sem ela.
    if (error?.code === "PGRST204" && "e_kit" in produto) {
      const { e_kit: _ignorado, ...semKit } = produto;
      void _ignorado;
      ({ data, error } = await supabase.from("produtos").insert(semEnvioVazio(semKit)).select("id").single());
    }
    if (error) lancarErroSupabase(error);
    if (!data) throw new Error("Erro ao criar produto.");
    await sincronizarLojasProduto(supabase, data.id, loja_ids);
    revalidateTudo();
  });
}

export async function atualizarProduto(id: string, dados: ProdutoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { loja_ids, ...produto } = validar(produtoSchema, dados);
    let { error } = await supabase.from("produtos").update(semEnvioVazio(paraGravar(produto, true))).eq("id", id);
    if (error?.code === "PGRST204" && "e_kit" in produto) {
      const { e_kit: _ignorado, ...semKit } = produto;
      void _ignorado;
      ({ error } = await supabase.from("produtos").update(semEnvioVazio(semKit)).eq("id", id));
    }
    if (error) lancarErroSupabase(error);
    await sincronizarLojasProduto(supabase, id, loja_ids);
    revalidateTudo();
  });
}

export async function removerProduto(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function alternarAtivoProduto(id: string, ativoAtual: boolean) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produtos").update({ ativo: !ativoAtual }).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function acaoEmMassaProdutos(ids: string[], acao: "ativar" | "desativar" | "remover") {
  return comResultado(async () => {
    const v = validar(acaoEmMassaProdutosSchema, { ids, acao });
    const supabase = await createClient();
    if (v.acao === "remover") {
      const { error } = await supabase.from("produtos").delete().in("id", v.ids);
      if (error) lancarErroSupabase(error);
    } else {
      const { error } = await supabase.from("produtos").update({ ativo: v.acao === "ativar" }).in("id", v.ids);
      if (error) lancarErroSupabase(error);
    }
    revalidateTudo();
  });
}

export async function adicionarImagemProduto(produtoId: string, url: string) {
  return comResultado(async () => {
    const v = validar(imagemProdutoSchema, { produto_id: produtoId, url });
    const supabase = await createClient();
    const { error } = await supabase.from("produto_imagens").insert({ produto_id: v.produto_id, url: v.url });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function removerImagemProduto(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("produto_imagens").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

/**
 * Gera descrição de produto com IA.
 *
 * NÃO revalida: nada é gravado aqui. O texto só vira `produtos.descricao` quando o
 * usuário aprovar no painel e salvar o formulário — o que importa porque essa coluna é
 * exibida na vitrine pública.
 */
export async function gerarDescricaoProdutoIA(contexto: unknown) {
  const supabase = await createClient();
  return gerarComIA(supabase, "descricao", contexto);
}

const fotoSchema = z.object({
  url: z.string().url().max(1000),
  nomeAtual: z.string().trim().max(200).nullable(),
  categorias: z.array(z.string().trim().min(1).max(80)).max(60),
  limiteTitulo: z.number().int().min(20).max(200),
  limiteDescricao: z.number().int().min(100).max(5000),
});

const MAX_FOTO_BYTES = 4 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

/**
 * Nome, descrição, categoria e atributos a partir da foto do produto (10.7). Só aceita
 * foto do Storage do próprio projeto (o servidor baixa a imagem: URL de fora seria SSRF).
 * NÃO grava nada — a tela mostra e o usuário escolhe o que usar.
 */
export async function gerarProdutoPelaFoto(dados: z.input<typeof fotoSchema>) {
  return comResultado(async () => {
    const v = validar(fotoSchema, dados);
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !v.url.startsWith(base)) throw new Error("Envie a foto do produto primeiro (só fotos enviadas aqui).");
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");

    const r = await fetch(v.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r?.ok || !TIPOS_FOTO.includes(mime)) throw new Error("Não consegui abrir a foto (use JPG, PNG ou WebP).");
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_FOTO_BYTES) throw new Error("Foto grande demais para a IA (máx. 4 MB).");

    const g = await gerarProdutoPelaFotoIA(
      supabase,
      { nomeAtual: v.nomeAtual, categorias: v.categorias, limiteTitulo: v.limiteTitulo, limiteDescricao: v.limiteDescricao },
      { base64: bytes.toString("base64"), mime, hash: createHash("sha256").update(bytes).digest("hex") },
    );
    if (!g.ok) throw new Error(g.erro);
    return g.dado;
  });
}
