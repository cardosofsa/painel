import { filtrarMercadorias, soMercadorias } from "@/lib/mercadorias-consulta";
import { createClient } from "@/lib/supabase/server";
import { buscarEmLotes } from "@/lib/lotes";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { PrecificacaoClient } from "./PrecificacaoClient";
import type { LojaOpcao, AnuncioSalvo, PrecificacaoHist } from "@/lib/precificacao-estado";
import type { Metadata } from "next";
import { VISOES_PRECIFICACAO } from "@/lib/precificacao-tipos";
import type { RascunhoPendente } from "@/lib/precificacao-rascunho";
import { faixaDaLinha, type LinhaFaixa } from "@/lib/faixas";
import type { Concorrente, FaixaComissao } from "@/lib/pricing";

export const metadata: Metadata = { title: "Precificação" };

export default async function PrecificacaoPage({ searchParams }: { searchParams: Promise<{ visao?: string; produto?: string; loja?: string }> }) {
  const { visao, produto, loja } = await searchParams;
  const supabase = await createClient();
  const [historicoRes, produtosRes, perfilRes, canaisRes, lojasRes, faixasRes, anunciosRes, concorrentesRes, gruposRes, categoriasRes, iaDisponivel, rascunhosRes, precosLojaRes, anunciosLojaRes] =
    await Promise.all([
    supabase
      .from("precificacoes")
      // `*`: anuncio, estrategia e imagem_url só existem a partir da 0045.
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(50),
    // Precifica o que se vende: insumo/embalagem (0096) fora. A variação vem (custo, histórico,
    // `?produto=`), mas a busca das abas mostra só o pai e o produto sem variação (`produtosParaBusca`).
    soMercadorias(
      (f) => {
        const q = supabase.from("produtos").select("id, sku, nome, custo, custo_base, insumos, preco_venda, grupo_id, variante_nome, palavras_chave, imagem_url, categoria_id, produto_pai_id");
        return filtrarMercadorias(q, f).order("nome");
      },
      { incluirFilhas: true },
    ),
    supabase.from("perfil_negocio").select("aliquota_das, nome_negocio, logo_url").maybeSingle(),
    supabase
      .from("canais")
      .select(
        "id, nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao, limite_titulo, limite_descricao",
      )
      .order("criado_em"),
    supabase.from("lojas_canal").select("id, canal_id, nome, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo").order("nome"),
    supabase.from("faixas_comissao_canal").select("*").order("ordem"),
    supabase
      .from("anuncios")
      .select(
        "id, nome_anuncio, titulo_anuncio, descricao, criado_em, anuncio_variacoes(id, nome_variacao, multiplicador, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, taxa_extra_valor, taxa_extra_tipo, margem_pct, preco_calculado, lucro)",
      )
      .order("criado_em", { ascending: false })
      .limit(30),
    supabase.from("concorrentes_preco").select("id, produto_id, nome, preco, link").order("criado_em"),
    supabase.from("produto_grupos").select("id, nome"),
    // `*`: `tipo` (insumo/embalagem) só existe a partir da 0042.
    supabase.from("categorias").select("*"),
    // No mesmo `Promise.all`: era um `await` sozinho no fim, uma ida ao banco a mais em série.
    iaDisponivelParaConta(supabase),
    // Rascunhos em andamento das quatro abas (0100); cada aba oferece o seu mais recente.
    // Sem a migração vem erro e a tela segue sem o aviso.
    supabase.from("precificacao_rascunhos").select("id, visao, titulo, atualizado_em, dados").order("atualizado_em", { ascending: false }).limit(20),
    // Preço de cada loja (0101). Sem a migração vem erro e o bloco não aparece.
    // Com a taxa adicional da precificação que gravou o preço (o lucro por loja usa a mesma conta).
    // Em lotes: o PostgREST corta em 1000 linhas.
    buscarEmLotes((de, ate) =>
      supabase
        .from("produto_lojas")
        .select("produto_id, loja_id, preco, preco_atualizado_em, precificacoes(taxa_adicional_pct)", { count: "exact" })
        .not("preco", "is", null)
        .order("produto_id")
        .order("loja_id")
        .range(de, ate),
    ),
    // Anúncios sincronizados, para o seletor "Analisar anúncio". `*`: nome_item é da 0093.
    supabase.from("marketplace_anuncios").select("*").limit(1000),
  ]);

  if (historicoRes.error) throw new Error(historicoRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (perfilRes.error) throw new Error(perfilRes.error.message);
  if (canaisRes.error) throw new Error(canaisRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (faixasRes.error) throw new Error(faixasRes.error.message);
  if (anunciosRes.error) throw new Error(anunciosRes.error.message);
  if (concorrentesRes.error) throw new Error(concorrentesRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);
  if (categoriasRes.error) throw new Error(categoriasRes.error.message);

  // O autocomplete corta em 6 sugestões: sem o rótulo, três variantes do mesmo
  // grupo ocupam metade da lista sem dar pra distinguir uma da outra.
  const grupos = mapaGrupos(gruposRes.data ?? []);
  const tipoCategoria = new Map(((categoriasRes.data ?? []) as { id: string; tipo?: string }[]).map((c) => [c.id, c.tipo ?? null]));
  const produtos = (produtosRes.data ?? []).map((p) => ({
    ...comRotulo(p, grupos),
    tipo: (p.categoria_id ? tipoCategoria.get(p.categoria_id) : null) as "produto" | "insumo" | "embalagem" | null,
  }));

  const canaisPorId = new Map((canaisRes.data ?? []).map((c) => [c.id, c]));

  const faixasPorCanal = new Map<string, FaixaComissao[]>();
  for (const f of (faixasRes.data ?? []) as (LinhaFaixa & { canal_id: string })[]) {
    const lista = faixasPorCanal.get(f.canal_id) ?? [];
    lista.push(faixaDaLinha(f));
    faixasPorCanal.set(f.canal_id, lista);
  }

  const lojas: LojaOpcao[] = (lojasRes.data ?? []).map((l) => {
    const canal = canaisPorId.get(l.canal_id);
    return {
      id: l.id,
      nome: l.nome,
      canalNome: canal?.nome ?? "—",
      tipoTaxa: canal?.tipo_taxa ?? "fixo",
      comissaoPct: l.comissao_pct ?? canal?.comissao_pct_padrao ?? 0,
      taxaFixa: l.taxa_fixa ?? canal?.taxa_fixa_padrao ?? 0,
      taxaExtraValor: l.taxa_extra_valor ?? canal?.taxa_extra_valor_padrao ?? null,
      taxaExtraTipo: l.taxa_extra_tipo ?? canal?.taxa_extra_tipo_padrao ?? null,
      faixas: faixasPorCanal.get(l.canal_id) ?? [],
      limiteTitulo: canal?.limite_titulo ?? null,
      limiteDescricao: canal?.limite_descricao ?? null,
    };
  });

  const anuncios: AnuncioSalvo[] = (anunciosRes.data ?? []).map((a) => ({
    id: a.id,
    nome_anuncio: a.nome_anuncio,
    titulo_anuncio: a.titulo_anuncio,
    descricao: a.descricao,
    criado_em: a.criado_em,
    variacoes: a.anuncio_variacoes ?? [],
  }));

  const concorrentesPorProduto: Record<string, Concorrente[]> = {};
  for (const c of concorrentesRes.data ?? []) {
    const lista = concorrentesPorProduto[c.produto_id] ?? [];
    lista.push({ id: c.id, nome: c.nome, preco: c.preco, link: c.link });
    concorrentesPorProduto[c.produto_id] = lista;
  }

  return (
    <PrecificacaoClient
      historico={(historicoRes.data ?? []) as PrecificacaoHist[]}
      produtos={produtos}
      aliquotaDasPadrao={perfilRes.data?.aliquota_das ?? 6}
      empresa={{ nome: perfilRes.data?.nome_negocio?.trim() || null, logoUrl: perfilRes.data?.logo_url ?? null }}
      lojas={lojas}
      anuncios={anuncios}
      concorrentesPorProduto={concorrentesPorProduto}
      // Lido no servidor: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`, então no cliente o
      // bundler trocaria por `undefined` calado e o botão sumiria sempre.
      iaDisponivel={iaDisponivel}
      visaoInicial={VISOES_PRECIFICACAO.find((v) => v === visao)}
      rascunhosPendentes={rascunhosRes.error ? [] : ((rascunhosRes.data ?? []) as RascunhoPendente[])}
      precosLoja={
        precosLojaRes.error
          ? null
          : (
              (precosLojaRes.data ?? []) as unknown as { produto_id: string; loja_id: string; preco: number; preco_atualizado_em: string | null; precificacoes: { taxa_adicional_pct: number | null } | null }[]
            ).map(({ precificacoes, ...p }) => ({ ...p, taxa_adicional_pct: precificacoes?.taxa_adicional_pct != null ? Number(precificacoes.taxa_adicional_pct) : null }))
      }
      inicial={{ produtoId: produto ?? null, lojaId: loja ?? null }}
      anunciosLoja={(() => {
        const vistos = new Set<string>();
        return ((anunciosLojaRes.data ?? []) as { id: string; loja_id: string; item_id: number; nome?: string | null; nome_item?: string | null }[])
          .filter((a) => !vistos.has(`${a.loja_id}:${a.item_id}`) && !!vistos.add(`${a.loja_id}:${a.item_id}`))
          .map((a) => ({ id: a.id, nome: a.nome_item ?? a.nome ?? `Anúncio ${a.item_id}` }));
      })()}
    />
  );
}
