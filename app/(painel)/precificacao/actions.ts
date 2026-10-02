"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  precificacaoSchema,
  anuncioSchema,
  precoProdutoSchema,
  concorrenteSchema,
  vincularProdutoPrecificacaoSchema,
} from "@/lib/validacao";
import { ID_CUSTO_PRODUTO, type ComponenteKit } from "@/lib/pricing";
import { gerarComIA } from "@/lib/ia/gerar";
import { LIMITE_DESCRICAO } from "@/lib/ia/prompts";
import { truncarEmPalavra } from "@/lib/ia/texto";
import { comResultado } from "@/lib/acao";

export interface PrecificacaoInput {
  produto_id: string | null;
  produto_nome: string;
  canal: string | null;
  titulo_anuncio: string | null;
  descricao_anuncio?: string | null;
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
  /** 0045 (opcionais). */
  anuncio?: { tipo: "percentual" | "valor"; valor: number; margem_alvo_pct: number | null } | null;
  estrategia?: { diagnostico: string; estrategias: { tipo: string; titulo: string; detalhe: string }[]; precoSugerido: number | null; motivoPreco: string | null } | null;
  imagem_url?: string | null;
}

export async function salvarPrecificacao(dados: PrecificacaoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(precificacaoSchema, dados);
    let { data, error } = await supabase.from("precificacoes").insert(v).select("id").single();
    // Sem a 0045 as colunas novas não existem (PGRST204): grava o resto, como antes.
    if (error?.code === "PGRST204") {
      const base: Record<string, unknown> = { ...v };
      for (const c of ["anuncio", "estrategia", "imagem_url"]) delete base[c];
      ({ data, error } = await supabase.from("precificacoes").insert(base).select("id").single());
    }
    if (error) lancarErroSupabase(error);
    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    return { id: (data?.id as string | undefined) ?? null };
  });
}

/**
 * Salva a planilha da calculadora em massa num INSERT só.
 *
 * Antes a tela chamava `salvarPrecificacao` linha a linha, em série: 50 linhas viravam 50
 * POSTs sequenciais, 50 clients Supabase novos e 100 `revalidatePath` — no recurso que se
 * chama, literalmente, "em massa". Devolve quantas entraram, e o erro sobe inteiro em vez
 * de virar uma contagem anônima de falhas.
 */
export async function salvarPrecificacoesEmMassa(linhas: PrecificacaoInput[]) {
  return comResultado(async () => {
    if (linhas.length === 0) return 0;
    if (linhas.length > 500) throw new Error("Máximo de 500 precificações por vez.");

    const supabase = await createClient();
    const validadas = linhas.map((l) => validar(precificacaoSchema, l));

    const { error } = await supabase.from("precificacoes").insert(validadas);
    if (error) lancarErroSupabase(error);

    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    return validadas.length;
  });
}

export async function removerPrecificacao(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("precificacoes").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/precificacao");
  });
}

export async function atualizarPrecoProduto(produtoId: string, precoVenda: number) {
  return comResultado(async () => {
    const v = validar(precoProdutoSchema, { produto_id: produtoId, preco_venda: precoVenda });
    const supabase = await createClient();
    const { error } = await supabase.from("produtos").update({ preco_venda: v.preco_venda }).eq("id", v.produto_id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/produtos");
    revalidatePath("/precificacao");
    revalidatePath("/dashboard");
  });
}

// ---------- Ligar precificação a um produto ----------

function gerarSkuAPartirDePrecificacao(): string {
  return `PREC-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export async function vincularProdutoPrecificacao(precificacaoId: string, produtoId: string) {
  return comResultado(async () => {
    const v = validar(vincularProdutoPrecificacaoSchema, { precificacao_id: precificacaoId, produto_id: produtoId });
    const supabase = await createClient();
    const { error } = await supabase.from("precificacoes").update({ produto_id: v.produto_id }).eq("id", v.precificacao_id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/precificacao");
    revalidatePath("/produtos");
  });
}

/**
 * Cria um produto a partir de uma precificação já salva: separa o JSONB `componentes` em
 * `custo_base` (a linha sentinela `ID_CUSTO_PRODUTO`) e `insumos` (o resto), e vincula a
 * precificação ao produto recém-criado — pra ela continuar aparecendo no resumo por canal.
 */
export async function criarProdutoDePrecificacao(precificacaoId: string, opcoes: { kit?: boolean } = {}) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: h, error: erroBusca } = await supabase
      .from("precificacoes")
      .select("produto_nome, componentes, preco_calculado, descricao_anuncio")
      .eq("id", precificacaoId)
      .single();
    if (erroBusca || !h) lancarErroSupabase(erroBusca ?? { message: "Precificação não encontrada." });

    const componentes = (h!.componentes ?? []) as ComponenteKit[];
    const doProduto = componentes.find((c) => c.id === ID_CUSTO_PRODUTO);
    const insumos = componentes.filter((c) => c.id !== ID_CUSTO_PRODUTO);

    const linha: Record<string, unknown> = {
        sku: gerarSkuAPartirDePrecificacao(),
        nome: h!.produto_nome,
        // A descrição da vitrine vai até 2000; a do anúncio, até 5000. Corta sem partir palavra.
        descricao: h!.descricao_anuncio ? truncarEmPalavra(h!.descricao_anuncio, LIMITE_DESCRICAO) : null,
        custo_base: doProduto?.custoUnitario ?? 0,
        insumos,
        preco_venda: h!.preco_calculado,
        estoque: 0,
        estoque_minimo: 10,
        saida_media_semanal: 0,
        ativo: true,
    };
    // Kit (0058): o estoque passa a vir dos itens. Sem a migração, cria como produto comum.
    let { data: produto, error: erroProduto } = await supabase
      .from("produtos")
      .insert((opcoes.kit ? { ...linha, e_kit: true, estoque_minimo: 0 } : linha) as Record<string, unknown>)
      .select("id")
      .single();
    if (erroProduto?.code === "PGRST204" && opcoes.kit) ({ data: produto, error: erroProduto } = await supabase.from("produtos").insert(linha).select("id").single());
    if (erroProduto) lancarErroSupabase(erroProduto);
    if (!produto) throw new Error("Erro ao criar produto.");

    const { error: erroVinculo } = await supabase
      .from("precificacoes")
      .update({ produto_id: produto.id })
      .eq("id", precificacaoId);
    if (erroVinculo) lancarErroSupabase(erroVinculo);

    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    return { produtoId: produto.id };
  });
}

/**
 * Cria um grupo de variantes e um produto por variação, a partir de um "Produto com
 * Variações" salvo. Cada variação vira uma linha em `produtos`, com `grupo_id` e
 * `variante_nome` — o mesmo formato que PDV e catálogo já sabem agrupar.
 *
 * `custo_base` recebe o custo TOTAL já calculado da variação (não decompõe em insumos):
 * decompor errado deixaria o custo composto divergir do que a precificação calculou, e
 * aqui o que importa é o produto nascer com o número certo — ajustar em insumos depois é
 * uma edição manual, se o dono quiser o detalhamento.
 */
export async function criarProdutosDeAnuncio(anuncioId: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: anuncio, error: erroAnuncio } = await supabase
      .from("anuncios")
      .select("nome_anuncio, descricao, anuncio_variacoes(nome_variacao, custo, preco_calculado)")
      .eq("id", anuncioId)
      .single();
    if (erroAnuncio || !anuncio) lancarErroSupabase(erroAnuncio ?? { message: "Produto com variações não encontrado." });

    const variacoes = anuncio!.anuncio_variacoes ?? [];
    if (variacoes.length === 0) throw new Error("Este anúncio não tem variações salvas.");

    const { data: grupo, error: erroGrupo } = await supabase
      .from("produto_grupos")
      .insert({ nome: anuncio!.nome_anuncio })
      .select("id")
      .single();
    if (erroGrupo) lancarErroSupabase(erroGrupo);
    if (!grupo) throw new Error("Erro ao criar grupo de variantes.");

    const linhas = variacoes.map((v) => ({
      sku: gerarSkuAPartirDePrecificacao(),
      nome: anuncio!.nome_anuncio,
      grupo_id: grupo.id,
      variante_nome: v.nome_variacao,
      descricao: anuncio!.descricao ? truncarEmPalavra(anuncio!.descricao, LIMITE_DESCRICAO) : null,
      custo_base: v.custo,
      insumos: [],
      preco_venda: v.preco_calculado,
      estoque: 0,
      estoque_minimo: 10,
      saida_media_semanal: 0,
      ativo: true,
    }));
    const { error: erroProdutos } = await supabase.from("produtos").insert(linhas);
    if (erroProdutos) lancarErroSupabase(erroProdutos);

    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    return { grupoId: grupo.id };
  });
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
  descricao?: string | null;
  componentes_base: ComponenteKit[] | null;
  variacoes: VariacaoInput[];
}

export async function criarAnuncio(dados: AnuncioInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    // Valida ANTES do primeiro insert: sem isso, um NaN vindo da tela passava pelo insert
    // do anúncio e só estourava no das variações, deixando o anúncio pai órfão no banco.
    const v = validar(anuncioSchema, dados);
    const { data: anuncio, error } = await supabase
      .from("anuncios")
      .insert({
        produto_id: v.produto_id,
        loja_id: v.loja_id,
        nome_anuncio: v.nome_anuncio,
        titulo_anuncio: v.titulo_anuncio,
        descricao: v.descricao ?? null,
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
  });
}

export async function removerAnuncio(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("anuncios").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/precificacao");
  });
}

// ---------- Preços dos Concorrentes ----------
export interface ConcorrenteInput {
  nome: string;
  preco: number;
  link: string | null;
}

export async function criarConcorrente(produtoId: string, dados: ConcorrenteInput) {
  return comResultado(async () => {
    const v = validar(concorrenteSchema, { produto_id: produtoId, ...dados });
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("concorrentes_preco")
      .insert({ produto_id: v.produto_id, nome: v.nome, preco: v.preco, link: v.link })
      .select("id, nome, preco, link")
      .single();
    if (error) lancarErroSupabase(error);
    if (!data) throw new Error("Erro ao salvar concorrente.");
    revalidatePath("/precificacao");
    return data;
  });
}

export async function removerConcorrenteSalvo(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("concorrentes_preco").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/precificacao");
  });
}

/**
 * Gera título de anúncio com IA. Serve as duas telas (individual e variações), já que
 * `VariacoesView` importa deste mesmo arquivo.
 *
 * NÃO chama `revalidatePath`: nada é gravado no domínio, e revalidar no meio de um
 * formulário refetcharia a página inteira por causa de um contador. A trava de acesso é
 * a de sempre — mora nas RPCs (`auth.uid()` + `conta_ativa()`), não neste arquivo.
 */
/** Descrição do anúncio (precificação), com o limite do canal. */
export async function gerarDescricaoAnuncioIA(contexto: unknown) {
  const supabase = await createClient();
  return gerarComIA(supabase, "descricao", contexto);
}

export async function gerarTituloAnuncioIA(contexto: unknown) {
  const supabase = await createClient();
  return gerarComIA(supabase, "titulo", contexto);
}
