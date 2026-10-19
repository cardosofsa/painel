import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LojaParaPreco } from "@/lib/precos-loja";
import { faixaDaLinha, type LinhaFaixa } from "@/lib/faixas";

/** Uma loja com as taxas efetivas (loja → padrão do canal) e as faixas do canal, lida com RLS. */
export async function carregarLojaParaPreco(supabase: SupabaseClient, lojaId: string): Promise<LojaParaPreco | null> {
  const { data } = await supabase
    .from("lojas_canal")
    .select("id, nome, canal_id, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo, canais(nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao)")
    .eq("id", lojaId)
    .maybeSingle();
  if (!data) return null;
  const l = data as unknown as {
    id: string; nome: string; canal_id: string; comissao_pct: number | null; taxa_fixa: number | null; taxa_extra_valor: number | null; taxa_extra_tipo: "percentual" | "fixo" | null;
    canais: { nome: string; tipo_taxa: "faixas" | "fixo"; comissao_pct_padrao: number | null; taxa_fixa_padrao: number | null; taxa_extra_valor_padrao: number | null; taxa_extra_tipo_padrao: "percentual" | "fixo" | null } | null;
  };
  const { data: faixas } = await supabase.from("faixas_comissao_canal").select("*").eq("canal_id", l.canal_id).order("ordem");
  return {
    id: l.id,
    nome: l.nome,
    canalNome: l.canais?.nome ?? "—",
    tipoTaxa: l.canais?.tipo_taxa ?? "fixo",
    comissaoPct: Number(l.comissao_pct ?? l.canais?.comissao_pct_padrao ?? 0),
    taxaFixa: Number(l.taxa_fixa ?? l.canais?.taxa_fixa_padrao ?? 0),
    taxaExtraValor: l.taxa_extra_valor ?? l.canais?.taxa_extra_valor_padrao ?? null,
    taxaExtraTipo: l.taxa_extra_tipo ?? l.canais?.taxa_extra_tipo_padrao ?? null,
    faixas: ((faixas ?? []) as LinhaFaixa[]).map(faixaDaLinha),
  };
}
