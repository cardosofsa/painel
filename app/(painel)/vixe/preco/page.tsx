import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { normalizarAbas } from "@/lib/acesso";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import type { FaixaComissao } from "@/lib/pricing";
import type { LojaPreco } from "@/lib/vixe/preco";
import { Card } from "@/components/ui/Card";
import { VixePreco, type ProdutoPreco } from "@/components/vixe/VixePreco";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vixe · Preço" };

type Busca = { produto?: string; nome?: string; custo?: string; preco?: string; loja?: string };

/** `?produto=&custo=&preco=&loja=` vem do atalho da Precificação, com o preço calculado lá. */
export default async function VixePrecoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const supabase = await createClient();
  const perfilAcesso = await acessoAtual();

  // Custos, taxas e concorrentes são dados da Precificação: sem essa aba, não aparecem aqui.
  if (!normalizarAbas(perfilAcesso?.abas ?? []).includes("precificacao")) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">
          O Vixe Preço usa os custos e as taxas da Precificação. Peça ao administrador para liberar a aba Precificação.
        </p>
      </Card>
    );
  }

  const [produtosRes, gruposRes, perfilRes, canaisRes, lojasRes, faixasRes, concorrentesRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, custo, preco_venda, grupo_id, variante_nome").eq("ativo", true).order("nome"),
    supabase.from("produto_grupos").select("id, nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    supabase.from("canais").select("id, nome, tipo_taxa, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao"),
    supabase.from("lojas_canal").select("id, canal_id, nome, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo").order("nome"),
    supabase.from("faixas_comissao_canal").select("canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa, criado_em").order("ordem"),
    supabase.from("concorrentes_preco").select("produto_id, preco"),
  ]);
  for (const r of [produtosRes, gruposRes, canaisRes, lojasRes, faixasRes, concorrentesRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const concorrentes = new Map<string, number[]>();
  for (const c of concorrentesRes.data ?? []) {
    if (c.preco == null) continue;
    concorrentes.set(c.produto_id, [...(concorrentes.get(c.produto_id) ?? []), c.preco]);
  }
  const produtos: ProdutoPreco[] = (produtosRes.data ?? []).map((p) => {
    const r = comRotulo(p, grupos);
    return { id: r.id, nome: r.nome, custo: r.custo, preco: r.preco_venda, concorrentes: concorrentes.get(r.id) ?? [] };
  });

  const faixas = new Map<string, FaixaComissao[]>();
  const faixasEm = new Map<string, string>();
  for (const f of faixasRes.data ?? []) {
    faixas.set(f.canal_id, [...(faixas.get(f.canal_id) ?? []), { min: f.preco_min, max: f.preco_max, comissaoPct: f.comissao_pct, tarifaFixa: f.tarifa_fixa }]);
    if (!faixasEm.has(f.canal_id) || f.criado_em > faixasEm.get(f.canal_id)!) faixasEm.set(f.canal_id, f.criado_em);
  }
  const canais = new Map((canaisRes.data ?? []).map((c) => [c.id, c]));
  const lojas: LojaPreco[] = (lojasRes.data ?? []).map((l) => {
    const c = canais.get(l.canal_id);
    return {
      id: l.id,
      nome: l.nome,
      canalNome: c?.nome ?? "—",
      tipoTaxa: c?.tipo_taxa ?? "fixo",
      comissaoPct: l.comissao_pct ?? c?.comissao_pct_padrao ?? 0,
      taxaFixa: l.taxa_fixa ?? c?.taxa_fixa_padrao ?? 0,
      taxaExtraValor: l.taxa_extra_valor ?? c?.taxa_extra_valor_padrao ?? null,
      taxaExtraTipo: l.taxa_extra_tipo ?? c?.taxa_extra_tipo_padrao ?? null,
      faixas: faixas.get(l.canal_id) ?? [],
      faixasAtualizadasEm: faixasEm.get(l.canal_id) ?? null,
    };
  });

  return (
    <VixePreco
      produtos={produtos}
      lojas={lojas}
      impostoPadraoPct={perfilRes.data?.aliquota_das ?? 6}
      iaDisponivel={await iaDisponivelParaConta(supabase)}
      inicial={{
        produtoId: produtos.some((p) => p.id === busca.produto) ? busca.produto! : null,
        nome: busca.nome?.slice(0, 200) ?? null,
        custo: busca.custo ?? null,
        preco: busca.preco ?? null,
        lojaId: lojas.some((l) => l.id === busca.loja) ? busca.loja! : null,
      }}
    />
  );
}
