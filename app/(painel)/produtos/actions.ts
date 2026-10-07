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
  exportarListaSchema,
  type ExportarListaInput,
} from "@/lib/validacao";
import { gerarComIA, gerarProdutoPelaFotoIA } from "@/lib/ia/gerar";
import { comResultado } from "@/lib/acao";
import type { ComponenteKit } from "@/lib/pricing";
import { buscarEmLotes } from "@/lib/lotes";
import { lerFiltroProdutos, palavrasDaBusca } from "@/lib/listas";
import { gruposPorPalavra, todosOsProdutos } from "./consulta";

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
  /** 0062: NCM (8 dígitos) e origem da mercadoria, para a NF-e. */
  ncm?: string | null;
  origem_fiscal?: number;
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

/** Colunas das migrações 0058/0062: fora do payload quando o banco ainda não as tem. */
function semColunasNovas<T extends Record<string, unknown>>(p: T): T {
  const copia = { ...p };
  for (const k of ["e_kit", "ncm", "origem_fiscal"]) delete copia[k];
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
    // Sem a 0058/0062 as colunas novas não existem: grava sem elas.
    if (error?.code === "PGRST204") ({ data, error } = await supabase.from("produtos").insert(semEnvioVazio(semColunasNovas(paraGravar(produto, false)))).select("id").single());
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
    if (error?.code === "PGRST204") ({ error } = await supabase.from("produtos").update(semEnvioVazio(semColunasNovas(paraGravar(produto, true)))).eq("id", id));
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

// ---------- Lista paginada: o que a tela não carrega mais de uma vez ----------

export interface ProdutoExportado {
  id: string;
  sku: string;
  nome: string;
  grupo_nome: string | null;
  variante_nome: string | null;
  categoria_nome: string | null;
  fornecedor_nome: string | null;
  armazem_nome: string | null;
  custo: number;
  preco_venda: number;
  estoque: number;
  estoque_minimo: number;
  ativo: boolean;
}

interface LinhaExportada {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  preco_venda: number;
  estoque: number;
  estoque_minimo: number;
  ativo: boolean;
  categoria_id: string | null;
  fornecedor_id: string | null;
  armazem_id: string | null;
  grupo_id: string | null;
  variante_nome: string | null;
}

/**
 * Exportar: a tela mostra uma página, então a lista (toda, a filtrada ou a dos
 * selecionados de qualquer página) é lida aqui, na hora do clique, com os mesmos filtros.
 */
export async function listarProdutosParaExportar(dados: ExportarListaInput) {
  return comResultado(async (): Promise<ProdutoExportado[]> => {
    const v = validar(exportarListaSchema, dados);
    const supabase = await createClient();
    const [categoriasRes, fornecedoresRes, armazensRes, gruposRes] = await Promise.all([
      supabase.from("categorias").select("id, nome"),
      supabase.from("fornecedores").select("id, nome"),
      supabase.from("armazens").select("id, nome"),
      supabase.from("produto_grupos").select("id, nome"),
    ]);
    for (const r of [categoriasRes, fornecedoresRes, armazensRes, gruposRes]) if (r.error) lancarErroSupabase(r.error);
    const filtro = lerFiltroProdutos(v.filtro);
    const grupos = gruposRes.data ?? [];
    const alvo =
      v.escopo === "selecionados"
        ? { ids: v.ids }
        : v.escopo === "filtrados"
          ? { filtro, grupos: gruposPorPalavra(grupos, filtro.q, palavrasDaBusca(filtro.q)) }
          : null;
    if (v.escopo === "selecionados" && v.ids.length === 0) return [];
    const r = await todosOsProdutos<LinhaExportada>(
      supabase,
      "id, sku, nome, custo, preco_venda, estoque, estoque_minimo, ativo, categoria_id, fornecedor_id, armazem_id, grupo_id, variante_nome",
      alvo,
    );
    if (r.error) lancarErroSupabase(r.error);
    const nome = (lista: { id: string; nome: string }[] | null) => new Map((lista ?? []).map((x) => [x.id, x.nome]));
    const [categorias, fornecedores, armazens, nomesGrupo] = [nome(categoriasRes.data), nome(fornecedoresRes.data), nome(armazensRes.data), nome(grupos)];
    return r.data.map((p) => ({
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      grupo_nome: p.grupo_id ? (nomesGrupo.get(p.grupo_id) ?? null) : null,
      variante_nome: p.variante_nome,
      categoria_nome: p.categoria_id ? (categorias.get(p.categoria_id) ?? null) : null,
      fornecedor_nome: p.fornecedor_id ? (fornecedores.get(p.fornecedor_id) ?? null) : null,
      armazem_nome: p.armazem_id ? (armazens.get(p.armazem_id) ?? null) : null,
      custo: Number(p.custo ?? 0),
      preco_venda: Number(p.preco_venda ?? 0),
      estoque: Number(p.estoque ?? 0),
      estoque_minimo: Number(p.estoque_minimo ?? 0),
      ativo: !!p.ativo,
    }));
  });
}

export interface ProdutoParaInsumo {
  id: string;
  nome: string;
  custo: number;
  sku: string;
  categoria_id: string | null;
}

export interface DimensoesPadrao {
  peso_g: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  comprimento_cm: number | null;
}

/**
 * O que o formulário de produto precisa da lista INTEIRA (e a página não traz mais):
 * os produtos que podem virar insumo de um kit e as medidas padrão de cada grupo de
 * variantes. Lido quando o formulário abre.
 */
export async function opcoesFormularioProduto() {
  return comResultado(async () => {
    const supabase = await createClient();
    const [insumosRes, envioRes] = await Promise.all([
      buscarEmLotes<ProdutoParaInsumo>(async (de, ate) => {
        const r = await supabase.from("produtos").select("id, nome, custo, sku, categoria_id", { count: "exact" }).order("nome").order("id").range(de, ate);
        return { data: r.data as ProdutoParaInsumo[] | null, error: r.error, count: r.count };
      }),
      // Envio (0041): sem a migração as colunas não existem e o padrão fica vazio.
      buscarEmLotes<DimensoesPadrao & { grupo_id: string }>(async (de, ate) => {
        const r = await supabase
          .from("produtos")
          .select("grupo_id, peso_g, altura_cm, largura_cm, comprimento_cm", { count: "exact" })
          .not("grupo_id", "is", null)
          .order("nome")
          .order("variante_nome", { nullsFirst: true })
          .order("id")
          .range(de, ate);
        return { data: r.data as (DimensoesPadrao & { grupo_id: string })[] | null, error: r.error, count: r.count };
      }),
    ]);
    if (insumosRes.error) lancarErroSupabase(insumosRes.error);
    if (envioRes.error) console.error("[produtos] medidas padrão por grupo:", envioRes.error.message);
    // Medidas padrão de cada grupo: as da primeira variante que tem alguma.
    const padroesEnvio: Record<string, DimensoesPadrao> = {};
    for (const p of envioRes.error ? [] : envioRes.data) {
      if (padroesEnvio[p.grupo_id]) continue;
      if (p.peso_g != null || p.altura_cm != null || p.largura_cm != null || p.comprimento_cm != null) {
        padroesEnvio[p.grupo_id] = { peso_g: p.peso_g ?? null, altura_cm: p.altura_cm ?? null, largura_cm: p.largura_cm ?? null, comprimento_cm: p.comprimento_cm ?? null };
      }
    }
    return {
      insumos: insumosRes.data.map((p) => ({ ...p, custo: Number(p.custo ?? 0) })),
      padroesEnvio,
    };
  });
}
