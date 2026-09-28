"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, precificacaoSchema, anuncioSchema } from "@/lib/validacao";
import type { ComponenteKit } from "@/lib/pricing";
import { gerarComIA, type ResultadoIA } from "@/lib/ia/gerar";

export interface PrecificacaoInput {
  produto_id: string | null;
  produto_nome: string;
  canal: string | null;
  titulo_anuncio: string | null;
  loja_id: string | null;
  componentes: ComponenteKit[] | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
  origem: "individual" | "em_massa";
}

export async function salvarPrecificacao(dados: PrecificacaoInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("precificacoes").insert(validar(precificacaoSchema, dados));
  if (error) lancarErroSupabase(error);
  revalidatePath("/precificacao");
  revalidatePath("/produtos");
}

/**
 * Salva a planilha da calculadora em massa num INSERT só.
 *
 * Antes a tela chamava `salvarPrecificacao` linha a linha, em série: 50 linhas viravam 50
 * POSTs sequenciais, 50 clients Supabase novos e 100 `revalidatePath` — no recurso que se
 * chama, literalmente, "em massa". Devolve quantas entraram, e o erro sobe inteiro em vez
 * de virar uma contagem anônima de falhas.
 */
export async function salvarPrecificacoesEmMassa(linhas: PrecificacaoInput[]): Promise<number> {
  if (linhas.length === 0) return 0;
  if (linhas.length > 500) throw new Error("Máximo de 500 precificações por vez.");

  const supabase = await createClient();
  const validadas = linhas.map((l) => validar(precificacaoSchema, l));

  const { error } = await supabase.from("precificacoes").insert(validadas);
  if (error) lancarErroSupabase(error);

  revalidatePath("/precificacao");
  revalidatePath("/produtos");
  return validadas.length;
}

export async function removerPrecificacao(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("precificacoes").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/precificacao");
}

export async function atualizarPrecoProduto(produtoId: string, precoVenda: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ preco_venda: precoVenda }).eq("id", produtoId);
  if (error) lancarErroSupabase(error);
  revalidatePath("/produtos");
  revalidatePath("/precificacao");
  revalidatePath("/dashboard");
}

// ---------- Anúncio com Variações ----------
export interface VariacaoInput {
  nome_variacao: string;
  multiplicador: number;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
}

export interface AnuncioInput {
  produto_id: string | null;
  loja_id: string | null;
  nome_anuncio: string;
  titulo_anuncio: string | null;
  componentes_base: ComponenteKit[] | null;
  variacoes: VariacaoInput[];
}

export async function criarAnuncio(dados: AnuncioInput) {
  const supabase = await createClient();
  // Valida ANTES do primeiro insert: sem isso, um NaN vindo da tela passava pelo insert do
  // anúncio e só estourava no das variações, deixando o anúncio pai órfão no banco.
  const v = validar(anuncioSchema, dados);
  const { data: anuncio, error } = await supabase
    .from("anuncios")
    .insert({
      produto_id: v.produto_id,
      loja_id: v.loja_id,
      nome_anuncio: v.nome_anuncio,
      titulo_anuncio: v.titulo_anuncio,
      componentes_base: v.componentes_base,
    })
    .select("id")
    .single();
  if (error) lancarErroSupabase(error);
  if (!anuncio) throw new Error("Erro ao criar anúncio.");

  const variacoes = v.variacoes.map((item) => ({ ...item, anuncio_id: anuncio.id }));
  const { error: erroVariacoes } = await supabase.from("anuncio_variacoes").insert(variacoes);
  if (erroVariacoes) lancarErroSupabase(erroVariacoes);

  revalidatePath("/precificacao");
}

export async function removerAnuncio(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("anuncios").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/precificacao");
}

// ---------- Preços dos Concorrentes ----------
export interface ConcorrenteInput {
  nome: string;
  preco: number;
  link: string | null;
}

export async function criarConcorrente(produtoId: string, dados: ConcorrenteInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("concorrentes_preco")
    .insert({ produto_id: produtoId, nome: dados.nome, preco: dados.preco, link: dados.link })
    .select("id, nome, preco, link")
    .single();
  if (error) lancarErroSupabase(error);
  if (!data) throw new Error("Erro ao salvar concorrente.");
  revalidatePath("/precificacao");
  return data;
}

export async function removerConcorrenteSalvo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("concorrentes_preco").delete().eq("id", id);
  if (error) lancarErroSupabase(error);
  revalidatePath("/precificacao");
}

/**
 * Gera título de anúncio com IA. Serve as duas telas (individual e variações), já que
 * `VariacoesView` importa deste mesmo arquivo.
 *
 * Diferente das outras actions daqui, retorna dado e NÃO chama `revalidatePath`: nada é
 * gravado no domínio, e revalidar no meio de um formulário refetcharia a página inteira
 * por causa de um contador. A trava de acesso é a de sempre — mora nas RPCs
 * (`auth.uid()` + `conta_ativa()`), não neste arquivo.
 *
 * Devolve `{ ok: false, erro }` em vez de lançar: exceção de Server Action é redigida pelo
 * Next em produção e a mensagem em pt-BR não chegaria à tela. Ver `ResultadoIA`.
 */
export async function gerarTituloAnuncioIA(contexto: unknown): Promise<ResultadoIA> {
  const supabase = await createClient();
  return gerarComIA(supabase, "titulo", contexto);
}
