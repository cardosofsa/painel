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
  paginaHistoricoSchema,
  precoPraticadoSchema,
  rascunhoPrecificacaoSchema,
  precoLojaSchema,
  faixasMargemSchema,
  precosPlanejadosSchema,
  explicarAjusteSchema,
  type PrecoPraticadoInput,
} from "@/lib/validacao";
import { ID_CUSTO_PRODUTO, type ComponenteKit } from "@/lib/pricing";
import { gerarComIA, gerarDiagnosticoPrecoIA } from "@/lib/ia/gerar";
import { carregarDadosAjuste } from "@/lib/ajuste-servidor";
import { calcularAjuste, noPreco, psicologicoAcima } from "@/lib/ajuste-preco";
import { LIMITE_DESCRICAO } from "@/lib/ia/prompts";
import { truncarEmPalavra } from "@/lib/ia/texto";
import { comResultado } from "@/lib/acao";
import { emPedacos } from "@/lib/lotes";
import type { PrecificacaoHist } from "@/lib/precificacao-tipos";

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
  /** 0100 (opcionais). */
  modo_calculo?: "margem" | "lucro" | "preco" | "markup" | null;
  parametro?: number | null;
  /** 0045 (opcionais). */
  anuncio?: { tipo: "percentual" | "valor"; valor: number; margem_alvo_pct: number | null } | null;
  estrategia?: { diagnostico: string; estrategias: { tipo: string; titulo: string; detalhe: string }[]; precoSugerido: number | null; motivoPreco: string | null } | null;
  imagem_url?: string | null;
  /** 0113 (opcionais): faixa de venda. */
  preco_minimo?: number | null;
  preco_maximo?: number | null;
}

const MSG_0113 = "A faixa de venda e a foto do anúncio precisam da migração 0113. Aplique no Supabase e salve de novo.";

export async function salvarPrecificacao(dados: PrecificacaoInput, rascunhoId: string | null = null) {
  return comResultado(async () => {
    const supabase = await createClient();
    const v = validar(precificacaoSchema, dados);
    let { data, error } = await supabase.from("precificacoes").insert(v).select("id").single();
    // Sem a 0045, a 0100 ou a 0113 as colunas novas não existem (PGRST204): grava o resto,
    // como antes. A faixa de venda preenchida não some calada: avisa da 0113.
    if (error?.code === "PGRST204") {
      if (error.message?.includes("preco_m") && (v.preco_minimo != null || v.preco_maximo != null)) throw new Error(MSG_0113);
      const base: Record<string, unknown> = { ...v };
      for (const c of ["anuncio", "estrategia", "imagem_url", "modo_calculo", "parametro", "preco_minimo", "preco_maximo"]) delete base[c];
      ({ data, error } = await supabase.from("precificacoes").insert(base).select("id").single());
    }
    if (error) lancarErroSupabase(error);
    // O rascunho cumpriu o papel: a precificação foi salva de verdade.
    if (rascunhoId && /^[0-9a-f-]{36}$/i.test(rascunhoId)) await supabase.from("precificacao_rascunhos").delete().eq("id", rascunhoId);
    // O preço vai para AQUELA loja (0101); `produtos.preco_venda` fica para PDV e catálogo.
    const precoNaLoja = v.produto_id && v.loja_id && data?.id ? await gravarPrecoLoja(supabase, v.produto_id, v.loja_id, v.preco_calculado, data.id as string) : false;
    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    return { id: (data?.id as string | undefined) ?? null, precoNaLoja };
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
  /** 0111: unidade do custo base e custos fixos por variação. */
  unidade?: "un" | "cx" | "kg" | "l";
  custo_embalagem?: number;
  custo_insumos?: number;
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
  /** 0113: faixa de venda da variação. */
  preco_minimo?: number | null;
  preco_maximo?: number | null;
}

export interface AnuncioInput {
  produto_id: string | null;
  loja_id: string | null;
  nome_anuncio: string;
  titulo_anuncio: string | null;
  descricao?: string | null;
  /** 0113: foto própria do anúncio. */
  imagem_url?: string | null;
  componentes_base: ComponenteKit[] | null;
  variacoes: VariacaoInput[];
}

export async function criarAnuncio(dados: AnuncioInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    // Valida ANTES do primeiro insert: sem isso, um NaN vindo da tela passava pelo insert
    // do anúncio e só estourava no das variações, deixando o anúncio pai órfão no banco.
    const v = validar(anuncioSchema, dados);
    const usaFaixa = v.variacoes.some((x) => x.preco_minimo != null || x.preco_maximo != null);
    // Sem a 0113 não há onde guardar a foto nem a faixa: avisa em vez de perder calado.
    if (v.imagem_url || usaFaixa) {
      const { error: sem0113 } = await supabase.from("anuncio_variacoes").select("preco_minimo").limit(0);
      if (sem0113?.code === "42703" || sem0113?.code === "PGRST204") throw new Error(MSG_0113);
    }
    const linhaAnuncio: Record<string, unknown> = {
      produto_id: v.produto_id,
      loja_id: v.loja_id,
      nome_anuncio: v.nome_anuncio,
      titulo_anuncio: v.titulo_anuncio,
      descricao: v.descricao ?? null,
      componentes_base: v.componentes_base,
    };
    if (v.imagem_url) linhaAnuncio.imagem_url = v.imagem_url;
    const { data: anuncio, error } = await supabase.from("anuncios").insert(linhaAnuncio).select("id").single();
    if (error) lancarErroSupabase(error);
    if (!anuncio) throw new Error("Erro ao criar anúncio.");

    // Sem faixa nenhuma, as colunas da 0113 nem vão: o insert funciona antes da migração.
    const variacoes = v.variacoes.map((item) => {
      const linha: Record<string, unknown> & typeof item = { ...item };
      if (!usaFaixa) {
        delete linha.preco_minimo;
        delete linha.preco_maximo;
      }
      return { ...linha, anuncio_id: anuncio.id };
    });
    let { error: erroVariacoes } = await supabase.from("anuncio_variacoes").insert(variacoes);
    // Sem a 0111: as colunas novas não existem e a quantidade é inteira. Se nada disso foi
    // usado, grava como antes; se foi, avisa (e tira o anúncio que ficaria sem variações).
    if (erroVariacoes && (erroVariacoes.code === "PGRST204" || erroVariacoes.code === "42703" || erroVariacoes.code === "22P02")) {
      const usaNovo = v.variacoes.some((x) => (x.unidade ?? "un") !== "un" || (x.custo_embalagem ?? 0) > 0 || (x.custo_insumos ?? 0) > 0 || !Number.isInteger(x.multiplicador));
      if (usaNovo) {
        await supabase.from("anuncios").delete().eq("id", anuncio.id);
        throw new Error("Unidade, quantidade fracionada, embalagem e insumos nas variações precisam da migração 0111. Aplique no Supabase e salve de novo.");
      }
      ({ error: erroVariacoes } = await supabase.from("anuncio_variacoes").insert(variacoes.map((x) => {
          const resto: Partial<typeof x> = { ...x };
          delete resto.unidade;
          delete resto.custo_embalagem;
          delete resto.custo_insumos;
          return resto;
        })));
    }
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

/**
 * Mais linhas do histórico: a tela abre com as 50 mais recentes, e filtrar ou exportar
 * "todas" alcançava só essas. `antesDe` = `criado_em` da última linha carregada.
 */
export async function carregarHistoricoPrecificacoes(antesDe: string | null, limite: number) {
  return comResultado(async () => {
    const v = validar(paginaHistoricoSchema, { antesDe, limite });
    const supabase = await createClient();
    let consulta = supabase.from("precificacoes").select("*").order("criado_em", { ascending: false }).limit(v.limite);
    if (v.antesDe) consulta = consulta.lt("criado_em", v.antesDe);
    const { data, error } = await consulta;
    if (error) lancarErroSupabase(error);
    return (data ?? []) as PrecificacaoHist[];
  });
}


// ---------- Raio-X (0071) ----------

export interface DadosRaioX {
  precificacoes: PrecificacaoHist[];
  /** Último preço digitado por chave do anúncio. */
  digitados: Record<string, { preco: number; observado_em: string }>;
  /** Preço no ar por `produto_id|loja_id` (média das variações vinculadas). */
  noAr: Record<string, { preco: number; lido_em: string | null }>;
  /** Vendas dos últimos 30 dias por `produto_id|loja_id` (loja vazia = PDV/catálogo). */
  vendas: Record<string, { quantidade: number; preco_medio: number }>;
  /** false = 0071 não aplicada: só o preço ideal aparece. */
  migracaoOk: boolean;
}

/** Tudo que o Raio-X precisa, carregado quando a aba abre (não pesa a tela principal). */
export async function carregarRaioX() {
  return comResultado(async (): Promise<DadosRaioX> => {
    const supabase = await createClient();
    const [precRes, digRes, arRes, vendasRes] = await Promise.all([
      supabase.from("precificacoes").select("*").order("criado_em", { ascending: false }).limit(1000),
      supabase.from("precos_praticados").select("chave, preco, observado_em").order("observado_em", { ascending: false }).limit(2000),
      supabase.from("marketplace_anuncios").select("produto_id, loja_id, preco_atual, preco_lido_em").not("produto_id", "is", null).not("preco_atual", "is", null).limit(5000),
      supabase.rpc("raio_x_vendas", { p_dias: 30 }),
    ]);
    if (precRes.error) lancarErroSupabase(precRes.error);
    const digitados: DadosRaioX["digitados"] = {};
    for (const d of (digRes.error ? [] : (digRes.data ?? [])) as { chave: string; preco: number; observado_em: string }[]) {
      if (!digitados[d.chave]) digitados[d.chave] = { preco: Number(d.preco), observado_em: d.observado_em };
    }
    const somaAr = new Map<string, { soma: number; n: number; lido: string | null }>();
    for (const a of (arRes.error ? [] : (arRes.data ?? [])) as { produto_id: string; loja_id: string; preco_atual: number; preco_lido_em: string | null }[]) {
      const k = `${a.produto_id}|${a.loja_id}`;
      const atual = somaAr.get(k) ?? { soma: 0, n: 0, lido: a.preco_lido_em };
      somaAr.set(k, { soma: atual.soma + Number(a.preco_atual), n: atual.n + 1, lido: atual.lido ?? a.preco_lido_em });
    }
    const noAr: DadosRaioX["noAr"] = {};
    for (const [k, v] of somaAr) noAr[k] = { preco: Math.round((v.soma / v.n) * 100) / 100, lido_em: v.lido };
    const vendas: DadosRaioX["vendas"] = {};
    for (const v of (vendasRes.error ? [] : (vendasRes.data ?? [])) as { produto_id: string; loja_id: string | null; quantidade: number; preco_medio: number }[]) {
      vendas[`${v.produto_id}|${v.loja_id ?? ""}`] = { quantidade: Number(v.quantidade), preco_medio: Number(v.preco_medio) };
    }
    return { precificacoes: (precRes.data ?? []) as PrecificacaoHist[], digitados, noAr, vendas, migracaoOk: !digRes.error && !vendasRes.error };
  });
}

/** Guarda o preço que a pessoa usa hoje num anúncio (0071). */
export async function salvarPrecoPraticado(input: PrecoPraticadoInput) {
  return comResultado(async () => {
    const d = validar(precoPraticadoSchema, input);
    const supabase = await createClient();
    const { error } = await supabase.from("precos_praticados").insert({ chave: d.chave, produto_id: d.produto_id, loja_id: d.loja_id, preco: d.preco, observacao: d.observacao ?? null });
    if (error?.code === "PGRST205" || error?.code === "42P01") throw new Error("Guardar o preço praticado precisa da migração 0071.");
    if (error) lancarErroSupabase(error);
  });
}

// ---------- Rascunho da Precificação (0100) ----------

const semTabela = (code?: string) => code === "PGRST205" || code === "42P01";

/**
 * Grava (cria ou atualiza) o rascunho. Sem a migração 0100 devolve `semMigracao: true` em vez
 * de erro: o salvamento automático só para, sem toast a cada 5 segundos.
 */
export async function salvarRascunhoPrecificacao(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string | null; semMigracao: boolean; salvoEm: string }> => {
    const v = validar(rascunhoPrecificacaoSchema, entrada);
    const supabase = await createClient();
    const linha = { visao: v.visao, produto_id: v.produto_id, titulo: v.titulo, dados: v.dados, atualizado_em: new Date().toISOString() };
    const r = v.id
      ? await supabase.from("precificacao_rascunhos").update(linha).eq("id", v.id).select("id, atualizado_em").maybeSingle()
      : await supabase.from("precificacao_rascunhos").insert(linha).select("id, atualizado_em").single();
    if (semTabela(r.error?.code)) return { id: null, semMigracao: true, salvoEm: linha.atualizado_em };
    if (r.error) lancarErroSupabase(r.error);
    // Atualizar um rascunho apagado em outra aba não acha a linha: cria de novo.
    if (!r.data) {
      const novo = await supabase.from("precificacao_rascunhos").insert(linha).select("id, atualizado_em").single();
      if (novo.error) lancarErroSupabase(novo.error);
      return { id: novo.data!.id as string, semMigracao: false, salvoEm: linha.atualizado_em };
    }
    return { id: r.data.id as string, semMigracao: false, salvoEm: linha.atualizado_em };
  });
}

export async function descartarRascunhoPrecificacao(id: string) {
  return comResultado(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Rascunho inválido.");
    const supabase = await createClient();
    const { error } = await supabase.from("precificacao_rascunhos").delete().eq("id", id);
    if (error && !semTabela(error.code)) lancarErroSupabase(error);
  });
}

// ---------- Preço por loja (0101) ----------

/**
 * Grava o preço de um produto numa loja (cria a ligação produto–loja se não existir).
 * Sem a 0101 as colunas não existem: devolve `false` e nada muda (o código segue como antes).
 */
async function gravarPrecoLoja(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaId: string,
  preco: number,
  precificacaoId: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("produto_lojas")
    .upsert(
      { produto_id: produtoId, loja_id: lojaId, preco: Math.round(preco * 100) / 100, precificacao_id: precificacaoId, preco_atualizado_em: new Date().toISOString() },
      { onConflict: "produto_id,loja_id" },
    );
  if (error?.code === "PGRST204" || error?.code === "42703") return false;
  if (error) lancarErroSupabase(error);
  return true;
}

/** Define o preço de uma loja sem nova precificação (Ajuste de Preço, "usar este preço"). */
export async function salvarPrecoLoja(entrada: { produto_id: string; loja_id: string; preco: number; precificacao_id?: string | null }) {
  return comResultado(async () => {
    const v = validar(precoLojaSchema, entrada);
    const supabase = await createClient();
    const ok = await gravarPrecoLoja(supabase, v.produto_id, v.loja_id, v.preco, v.precificacao_id ?? null);
    if (!ok) throw new Error("O preço por loja precisa da migração 0101 no banco.");
    revalidatePath("/precificacao");
    revalidatePath("/produtos");
    revalidatePath("/anuncio");
  });
}

// ---------- Preço planejado por anúncio (0115) ----------

/**
 * Grava o preço de cada anúncio da loja: cada um tem o seu, mesmo quando vários vendem o mesmo
 * produto. O preço na Shopee não muda; `produto_lojas` (Precificação) também não.
 */
export async function salvarPrecosPlanejados(entrada: { itens: { anuncio_id: string; preco: number; margem: number | null }[] }) {
  return comResultado(async (): Promise<number> => {
    const v = validar(precosPlanejadosSchema, entrada);
    const supabase = await createClient();
    const agora = new Date().toISOString();
    let gravados = 0;
    // Um `update` por anúncio (cada um tem um valor), 20 de cada vez.
    for (let i = 0; i < v.itens.length; i += 20) {
      const lote = v.itens.slice(i, i + 20);
      const rs = await Promise.all(
        lote.map((it) =>
          supabase
            .from("marketplace_anuncios")
            .update({ preco_planejado: Math.round(it.preco * 100) / 100, margem_planejada: it.margem, preco_planejado_em: agora })
            .eq("id", it.anuncio_id)
            .select("id"),
        ),
      );
      for (const r of rs) {
        if (r.error?.code === "PGRST204" || r.error?.code === "42703") throw new Error("O preço por anúncio precisa da migração 0115 no banco.");
        if (r.error) lancarErroSupabase(r.error);
        gravados += r.data?.length ?? 0;
      }
    }
    revalidatePath("/anuncio", "layout");
    return gravados;
  });
}

// ---------- Faixa de margem por produto (0114) ----------

/**
 * Grava a faixa de margem de vários produtos. Um `update` por faixa diferente (quem recebeu
 * 20–30% vai junto), não um por produto.
 */
export async function salvarFaixasMargem(entrada: { itens: { produto_id: string; margem_minima: number | null; margem_maxima: number | null }[] }) {
  return comResultado(async () => {
    const v = validar(faixasMargemSchema, entrada);
    const supabase = await createClient();
    const porFaixa = new Map<string, { min: number | null; max: number | null; ids: string[] }>();
    for (const i of v.itens) {
      const k = `${i.margem_minima}|${i.margem_maxima}`;
      const g = porFaixa.get(k) ?? { min: i.margem_minima, max: i.margem_maxima, ids: [] };
      g.ids.push(i.produto_id);
      porFaixa.set(k, g);
    }
    for (const g of porFaixa.values()) {
      for (const ids of emPedacos(g.ids)) {
        const { error } = await supabase.from("produtos").update({ margem_minima: g.min, margem_maxima: g.max }).in("id", ids);
        if (error?.code === "PGRST204" || error?.code === "42703") throw new Error("A faixa de margem precisa da migração 0114 no banco.");
        if (error) lancarErroSupabase(error);
      }
    }
    revalidatePath("/precificacao");
    revalidatePath("/anuncio", "layout");
  });
}

// ---------- Ajuste de Preço: a IA explica e prioriza (fase 6) ----------

/**
 * A IA só NARRA: os números (custo, taxas, faixa, mínimo, zona morta, concorrentes) são lidos e
 * calculados aqui, no servidor, a partir de ids. Do navegador vêm só os ids e o preço da régua.
 */
export async function explicarAjusteIA(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(explicarAjusteSchema, entrada);
    const supabase = await createClient();
    const dados = await carregarDadosAjuste(supabase, v.anuncio_id ? { anuncioId: v.anuncio_id } : { produtoId: v.produto_id!, lojaId: v.loja_id ?? null });
    if (!dados || dados === "sem_produto" || !dados.loja) throw new Error("Não foi possível carregar o anúncio.");
    const e = { custo: dados.produto.custo, loja: dados.loja, impostoPct: dados.impostoPct, margemAlvo: dados.margemAlvo, precoAtual: v.preco, concorrentes: dados.concorrentes, vendas30d: dados.vendas?.d30.unidades ?? 0 };
    const a = calcularAjuste(e);
    const { resultado, faixa } = noPreco(e, v.preco);
    const zona = a.zonasMortas.find((z) => v.preco >= z.inicio && v.preco <= z.fim);
    const media = dados.concorrentes.length ? dados.concorrentes.reduce((x, y) => x + y, 0) / dados.concorrentes.length : null;
    const r = await gerarDiagnosticoPrecoIA(supabase, {
      produtoNome: dados.produto.nome,
      canal: `${dados.loja.canalNome} · ${dados.loja.nome}`,
      objetivo: v.objetivo,
      custo: dados.produto.custo,
      preco: v.preco,
      lucro: resultado.lucroLiquido,
      margemPct: resultado.margemEfetivaPct,
      comissaoPct: faixa ? faixa.comissaoPct : dados.loja.comissaoPct,
      tarifa: faixa ? faixa.tarifaFixa : dados.loja.taxaFixa,
      impostoPct: dados.impostoPct,
      precoMinimoViavel: a.precoMinimo,
      zonaMorta: zona ? { inicio: zona.inicio, fim: zona.fim, precoMelhor: Math.round((zona.inicio - 0.01) * 100) / 100, ganhoLiquido: 0 } : null,
      concorrencia:
        media !== null
          ? { min: Math.min(...dados.concorrentes), max: Math.max(...dados.concorrentes), media, diferencaPct: (v.preco - media) / media, quantidade: dados.concorrentes.length }
          : null,
      precoPsicologico: psicologicoAcima(v.preco),
      instrucaoExtra: dados.vendas ? `Vendas: ${dados.vendas.d30.unidades} unidades em 30 dias e ${dados.vendas.d90.unidades} em 90; tendência ${dados.tendencia}; estoque ${dados.produto.estoque}.` : null,
    });
    if (!r.ok) throw new Error(r.erro);
    return r.dado;
  });
}
