import { createClient } from "@/lib/supabase/server";
import { PrecificacaoClient, type LojaOpcao, type AnuncioSalvo } from "./PrecificacaoClient";

export default async function PrecificacaoPage() {
  const supabase = await createClient();
  const [historicoRes, produtosRes, perfilRes, canaisRes, lojasRes, anunciosRes] = await Promise.all([
    supabase
      .from("precificacoes")
      .select(
        "id, produto_nome, canal, titulo_anuncio, loja_id, componentes, taxa_extra_valor, taxa_extra_tipo, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, margem_pct, preco_calculado, lucro, criado_em",
      )
      .order("criado_em", { ascending: false })
      .limit(50),
    supabase.from("produtos").select("id, sku, nome, preco_venda").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    supabase
      .from("canais")
      .select("id, nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao")
      .order("criado_em"),
    supabase.from("lojas_canal").select("id, canal_id, nome, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo").order("nome"),
    supabase
      .from("anuncios")
      .select(
        "id, nome_anuncio, titulo_anuncio, criado_em, anuncio_variacoes(id, nome_variacao, multiplicador, custo, taxa_variavel_pct, taxa_fixa, taxa_adicional_pct, imposto_pct, taxa_extra_valor, taxa_extra_tipo, margem_pct, preco_calculado, lucro)",
      )
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);

  if (historicoRes.error) throw new Error(historicoRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (perfilRes.error) throw new Error(perfilRes.error.message);
  if (canaisRes.error) throw new Error(canaisRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (anunciosRes.error) throw new Error(anunciosRes.error.message);

  const canaisPorId = new Map((canaisRes.data ?? []).map((c) => [c.id, c]));

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
    };
  });

  const anuncios: AnuncioSalvo[] = (anunciosRes.data ?? []).map((a) => ({
    id: a.id,
    nome_anuncio: a.nome_anuncio,
    titulo_anuncio: a.titulo_anuncio,
    criado_em: a.criado_em,
    variacoes: a.anuncio_variacoes ?? [],
  }));

  return (
    <PrecificacaoClient
      historico={historicoRes.data ?? []}
      produtos={produtosRes.data ?? []}
      aliquotaDasPadrao={perfilRes.data?.aliquota_das ?? 6}
      lojas={lojas}
      anuncios={anuncios}
    />
  );
}
