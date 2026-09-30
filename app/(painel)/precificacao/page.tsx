import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { PrecificacaoClient } from "./PrecificacaoClient";
import type { LojaOpcao, AnuncioSalvo } from "@/lib/precificacao-estado";
import type { Concorrente } from "@/lib/pricing";

export default async function PrecificacaoPage() {
  const supabase = await createClient();
  const [historicoRes, produtosRes, perfilRes, canaisRes, lojasRes, faixasRes, anunciosRes, concorrentesRes, gruposRes] =
    await Promise.all([
    supabase
      .from("precificacoes")
      .select(
        "id, produto_id, produto_nome, canal, titulo_anuncio, descricao_anuncio, loja_id, componentes, taxa_extra_valor, taxa_extra_tipo, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, margem_pct, preco_calculado, lucro, criado_em, origem",
      )
      .order("criado_em", { ascending: false })
      .limit(50),
    supabase.from("produtos").select("id, sku, nome, custo, preco_venda, grupo_id, variante_nome, palavras_chave, imagem_url").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das, nome_negocio, logo_url").maybeSingle(),
    supabase
      .from("canais")
      .select(
        "id, nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao, limite_titulo, limite_descricao",
      )
      .order("criado_em"),
    supabase.from("lojas_canal").select("id, canal_id, nome, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo").order("nome"),
    supabase.from("faixas_comissao_canal").select("canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa").order("ordem"),
    supabase
      .from("anuncios")
      .select(
        "id, nome_anuncio, titulo_anuncio, descricao, criado_em, anuncio_variacoes(id, nome_variacao, multiplicador, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, taxa_extra_valor, taxa_extra_tipo, margem_pct, preco_calculado, lucro)",
      )
      .order("criado_em", { ascending: false })
      .limit(30),
    supabase.from("concorrentes_preco").select("id, produto_id, nome, preco, link").order("criado_em"),
    supabase.from("produto_grupos").select("id, nome"),
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

  // O autocomplete corta em 6 sugestões: sem o rótulo, três variantes do mesmo
  // grupo ocupam metade da lista sem dar pra distinguir uma da outra.
  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));

  const canaisPorId = new Map((canaisRes.data ?? []).map((c) => [c.id, c]));

  const faixasPorCanal = new Map<string, { min: number; max: number | null; comissaoPct: number; tarifaFixa: number }[]>();
  for (const f of faixasRes.data ?? []) {
    const lista = faixasPorCanal.get(f.canal_id) ?? [];
    lista.push({ min: f.preco_min, max: f.preco_max, comissaoPct: f.comissao_pct, tarifaFixa: f.tarifa_fixa });
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

  const iaDisponivel = await iaDisponivelParaConta(supabase);

  return (
    <PrecificacaoClient
      historico={historicoRes.data ?? []}
      produtos={produtos}
      aliquotaDasPadrao={perfilRes.data?.aliquota_das ?? 6}
      empresa={{ nome: perfilRes.data?.nome_negocio?.trim() || null, logoUrl: perfilRes.data?.logo_url ?? null }}
      lojas={lojas}
      anuncios={anuncios}
      concorrentesPorProduto={concorrentesPorProduto}
      // Lido no servidor: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`, então no cliente o
      // bundler trocaria por `undefined` calado e o botão sumiria sempre.
      iaDisponivel={iaDisponivel}
    />
  );
}
