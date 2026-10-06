import type { SupabaseClient } from "@supabase/supabase-js";
import type { LojaOpcao } from "../precificacao-tipos";
import { ratear, type LinhaVendida } from "./radar";

/**
 * Dados do Vixe Radar (11.2). Código de SERVIDOR: lê as vendas e pedidos dos últimos
 * `dias` e devolve as linhas já com as deduções rateadas por item.
 */
export interface DadosRadar {
  linhas: LinhaVendida[];
  produtos: { id: string; nome: string; sku: string | null; custo: number }[];
  lojas: (Pick<LojaOpcao, "id" | "nome" | "canalNome" | "tipoTaxa" | "comissaoPct" | "taxaFixa" | "taxaExtraValor" | "taxaExtraTipo" | "faixas">)[];
  impostoPct: number;
  dias: number;
}

export async function carregarRadar(supabase: SupabaseClient, dias = 30): Promise<DadosRadar> {
  const inicio = new Date(Date.now() - dias * 86_400_000).toISOString();
  const inicioDia = inicio.slice(0, 10);
  const hojeDia = new Date().toISOString().slice(0, 10);
  const [vendasRes, mktRes, produtosRes, canaisRes, lojasRes, faixasRes, perfilRes, anunciosRes] = await Promise.all([
    supabase
      .from("vendas")
      .select("*, venda_itens(produto_id, quantidade, preco_unitario, custo_unitario)")
      .neq("status", "cancelada")
      .gte("data_venda", inicio)
      .limit(5000),
    supabase
      .from("pedidos_marketplace")
      .select("*, pedidos_marketplace_itens(produto_id, quantidade, preco_unitario, custo_unitario)")
      .in("status", ["a_enviar", "enviado", "concluido"])
      .gte("criado_em_plataforma", inicio)
      .limit(5000),
    supabase.from("produtos").select("id, nome, sku, custo"),
    supabase.from("canais").select("id, nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao"),
    supabase.from("lojas_canal").select("id, canal_id, nome, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo"),
    supabase.from("faixas_comissao_canal").select("canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa").order("ordem"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    // Anúncio ligado a produto (0066). Sem a migração, o erro é ignorado: Radar sem anúncio.
    supabase.from("gastos_anuncios").select("produto_id, loja_id, periodo_inicio, periodo_fim, valor").not("produto_id", "is", null).lte("periodo_inicio", hojeDia).gte("periodo_fim", inicioDia),
  ]);

  const linhas: LinhaVendida[] = [];
  type ItemBruto = { produto_id: string | null; quantidade: number; preco_unitario: number; custo_unitario: number | null };

  for (const v of (vendasRes.data ?? []) as (Record<string, unknown> & { venda_itens: ItemBruto[] })[]) {
    const itens = (v.venda_itens ?? []).filter((i) => i.produto_id);
    const receitas = itens.map((i) => ({ receita: Number(i.preco_unitario) * i.quantidade }));
    // Imposto da venda (0032), taxa da maquininha (0030) e o desconto saem da receita,
    // rateados pelo valor de cada item.
    const deducao = Number(v.imposto_valor ?? 0) + Number(v.taxa_maquineta_valor ?? 0) + Number(v.desconto ?? 0);
    const partes = ratear(receitas, deducao);
    itens.forEach((i, n) =>
      linhas.push({ produtoId: i.produto_id as string, canal: "venda-direta", quantidade: i.quantidade, receita: receitas[n].receita, custo: Number(i.custo_unitario ?? 0) * i.quantidade, deducoes: partes[n] }),
    );
  }

  for (const p of (mktRes.data ?? []) as (Record<string, unknown> & { pedidos_marketplace_itens: ItemBruto[] })[]) {
    const itens = (p.pedidos_marketplace_itens ?? []).filter((i) => i.produto_id);
    if (!itens.length) continue;
    const receitas = itens.map((i) => ({ receita: Number(i.preco_unitario) * i.quantidade }));
    const taxas = ["comissao", "taxa_servico", "taxa_transacao", "cupom_vendedor", "imposto"].reduce((s, k) => s + Number(p[k] ?? 0), 0);
    const partes = ratear(receitas, taxas);
    itens.forEach((i, n) =>
      linhas.push({ produtoId: i.produto_id as string, canal: String(p.loja_id), quantidade: i.quantidade, receita: receitas[n].receita, custo: Number(i.custo_unitario ?? 0) * i.quantidade, deducoes: partes[n] }),
    );
  }

  // Gasto com anúncio do produto, só a parte que cai na janela do Radar (rateio por dia),
  // dividido entre as vendas do produto naquela loja (ou em todos os marketplaces).
  for (const g of (anunciosRes.error ? [] : (anunciosRes.data ?? [])) as { produto_id: string; loja_id: string | null; periodo_inicio: string; periodo_fim: string; valor: number }[]) {
    const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const total = (dia(g.periodo_fim) - dia(g.periodo_inicio)) / 86_400_000 + 1;
    const dentro = (Math.min(dia(g.periodo_fim), dia(hojeDia)) - Math.max(dia(g.periodo_inicio), dia(inicioDia))) / 86_400_000 + 1;
    const valor = total > 0 && dentro > 0 ? (Number(g.valor) * dentro) / total : 0;
    if (valor <= 0) continue;
    let alvo = linhas.filter((l) => l.produtoId === g.produto_id && (g.loja_id ? l.canal === g.loja_id : l.canal !== "venda-direta"));
    if (!alvo.length) alvo = linhas.filter((l) => l.produtoId === g.produto_id);
    if (!alvo.length) continue;
    const partes = ratear(alvo, valor);
    alvo.forEach((l, n) => (l.deducoes += partes[n]));
  }

  const canais = new Map((canaisRes.data ?? []).map((c) => [c.id as string, c]));
  const faixas = new Map<string, { min: number; max: number | null; comissaoPct: number; tarifaFixa: number }[]>();
  for (const f of faixasRes.data ?? []) {
    const l = faixas.get(f.canal_id) ?? [];
    l.push({ min: Number(f.preco_min), max: f.preco_max == null ? null : Number(f.preco_max), comissaoPct: Number(f.comissao_pct), tarifaFixa: Number(f.tarifa_fixa) });
    faixas.set(f.canal_id, l);
  }
  const lojas = (lojasRes.data ?? []).map((l) => {
    const c = canais.get(l.canal_id);
    return {
      id: l.id as string,
      nome: l.nome as string,
      canalNome: (c?.nome as string) ?? "—",
      tipoTaxa: (c?.tipo_taxa as "faixas" | "fixo") ?? "fixo",
      comissaoPct: Number(l.comissao_pct ?? c?.comissao_pct_padrao ?? 0),
      taxaFixa: Number(l.taxa_fixa ?? c?.taxa_fixa_padrao ?? 0),
      taxaExtraValor: (l.taxa_extra_valor ?? c?.taxa_extra_valor_padrao ?? null) as number | null,
      taxaExtraTipo: (l.taxa_extra_tipo ?? c?.taxa_extra_tipo_padrao ?? null) as "percentual" | "fixo" | null,
      faixas: faixas.get(l.canal_id) ?? [],
    };
  });

  return {
    linhas,
    produtos: (produtosRes.data ?? []).map((p) => ({ id: p.id as string, nome: p.nome as string, sku: (p.sku as string | null) ?? null, custo: Number(p.custo ?? 0) })),
    lojas,
    impostoPct: Number(perfilRes.data?.aliquota_das ?? 0),
    dias,
  };
}
