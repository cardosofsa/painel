import { semVariacoesFilhas } from "@/lib/variacoes-consulta";
import { buscarEmLotes } from "@/lib/lotes";
import { createClient } from "@/lib/supabase/server";
import { podeVencer } from "@/lib/repasse-marketplace";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { normalizarAbas } from "@/lib/acesso";
import { hojeIsoBrasil } from "@/lib/format";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import {
  compararPeriodos,
  estoqueParado,
  fluxoProximo,
  rankingProdutos,
  type ItemVendido,
  type Pendencia,
  type VendaResumo,
} from "@/lib/vixe/insights";
import { VixeInsights } from "@/components/vixe/VixeInsights";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vixe · Insights" };

/** Janela das vendas: 30 dias atuais + 30 anteriores para comparar. */
const JANELA_DIAS = 60;

export default async function VixeInsightsPage() {
  const supabase = await createClient();
  const perfilAcesso = await acessoAtual();
  const abas = normalizarAbas(perfilAcesso?.abas ?? []);
  const verVendas = abas.includes("vendas") || abas.includes("pdv") || abas.includes("financeiro");
  const verEstoque = abas.includes("estoque") || abas.includes("produtos");
  const verFinanceiro = abas.includes("financeiro");

  const agora = new Date();
  const inicio = new Date(agora.getTime() - JANELA_DIAS * 86_400_000).toISOString();
  const hoje = hojeIsoBrasil(agora);
  const vazio = Promise.resolve({ data: [] as never[], error: null });

  const [vendasRes, itensRes, produtosRes, gruposRes, cprRes, parcelasRes, perfilRes] = await Promise.all([
    verVendas
      ? buscarEmLotes((de, ate) => supabase.from("vendas").select("data_venda, total, lucro", { count: "exact" }).neq("status", "cancelada").gte("data_venda", inicio).order("id").range(de, ate), { maximo: 20000 })
      : vazio,
    verVendas || verEstoque
      ? buscarEmLotes(
          (de, ate) =>
            supabase
              .from("venda_itens")
              .select("produto_id, produto_nome, quantidade, preco_unitario, custo_unitario, vendas!inner(data_venda, status)", { count: "exact" })
              .gte("vendas.data_venda", inicio)
              .neq("vendas.status", "cancelada")
              .order("id")
              .range(de, ate),
          { maximo: 50000 },
        )
      : vazio,
    // Valor e ruptura só do produto principal: o estoque da variação (0084) é derivado dele.
    verEstoque
      ? semVariacoesFilhas((filtrar) =>
          buscarEmLotes((de, ate) => {
            const q = supabase.from("produtos").select("id, nome, estoque, custo, grupo_id, variante_nome", { count: "exact" }).eq("ativo", true);
            return (filtrar ? q.is("produto_pai_id", null) : q).order("id").range(de, ate);
          }),
        )
      : vazio,
    supabase.from("produto_grupos").select("id, nome"),
    verFinanceiro ? buscarEmLotes((de, ate) => supabase.from("contas_a_pagar_receber").select("*", { count: "exact" }).eq("status", "pendente").order("id").range(de, ate)) : vazio,
    verFinanceiro ? buscarEmLotes((de, ate) => supabase.from("venda_parcelas").select("venda_id, valor, data_vencimento", { count: "exact" }).eq("status", "pendente").order("id").range(de, ate)) : vazio,
    supabase.from("perfil_negocio").select("nome_negocio, whatsapp").maybeSingle(),
  ]);
  const falhas = [vendasRes, itensRes, produtosRes, cprRes, parcelasRes].filter((r) => r.error).map((r) => r.error!.message);

  type ItemBruto = ItemVendido & { vendas: { data_venda: string } | null };
  const itens = (itensRes.data ?? []) as unknown as ItemBruto[];
  const corte30 = agora.getTime() - 30 * 86_400_000;
  const itens30 = itens.filter((i) => i.vendas && new Date(i.vendas.data_venda).getTime() >= corte30);
  const corte7 = agora.getTime() - 7 * 86_400_000;
  const itens7 = itens.filter((i) => i.vendas && new Date(i.vendas.data_venda).getTime() >= corte7);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = ((produtosRes.data ?? []) as { id: string; nome: string; estoque: number; custo: number; grupo_id: string | null; variante_nome: string | null }[]).map(
    (p) => comRotulo(p, grupos),
  );
  const vendidos = new Set(itens.map((i) => i.produto_id).filter((id): id is string => !!id));

  // Mesma regra da Vixe Alertas: a conta a receber ligada a uma venda parcelada é o mesmo
  // dinheiro das parcelas, então não entra duas vezes.
  const parcelas = (parcelasRes.data ?? []) as { venda_id: string; valor: number; data_vencimento: string }[];
  const vendasComParcelas = new Set(parcelas.map((p) => p.venda_id));
  // `*` + filtro aqui: repasse aguardando a conclusão do pedido (0085) não tem vencimento; sem a migração a coluna não existe.
  const cpr = ((cprRes.data ?? []) as { tipo: "pagar" | "receber"; valor: number; data_vencimento: string; referencia_venda_id: string | null; aguardando_liberacao?: boolean | null; descricao?: string; referencia_pedido_marketplace_id?: string | null }[]).filter(
    podeVencer,
  );
  const pendencias: Pendencia[] = [
    ...parcelas.map((p) => ({ tipo: "receber" as const, valor: p.valor, vencimento: p.data_vencimento })),
    ...cpr
      .filter((c) => !(c.referencia_venda_id && vendasComParcelas.has(c.referencia_venda_id)))
      .map((c) => ({ tipo: c.tipo, valor: c.valor, vencimento: c.data_vencimento })),
  ];

  return (
    <VixeInsights
      periodos={verVendas ? compararPeriodos((vendasRes.data ?? []) as VendaResumo[], agora) : null}
      ranking={verVendas ? rankingProdutos(itens30).slice(0, 8) : null}
      parados={verEstoque ? estoqueParado(produtos, vendidos).slice(0, 8) : null}
      totalParado={verEstoque ? estoqueParado(produtos, vendidos).reduce((s, p) => s + p.capital, 0) : 0}
      fluxo={verFinanceiro ? fluxoProximo(pendencias, hoje) : null}
      janelaParadoDias={JANELA_DIAS}
      falhas={falhas}
      resumoSemana={
        verVendas
          ? {
              semana: compararPeriodos((vendasRes.data ?? []) as VendaResumo[], agora, 7),
              campeoes: rankingProdutos(itens7).slice(0, 5),
              parados: verEstoque ? estoqueParado(produtos, vendidos).slice(0, 3) : [],
              fluxo: verFinanceiro ? fluxoProximo(pendencias, hoje) : null,
            }
          : null
      }
      loja={(perfilRes.data?.nome_negocio as string | null)?.trim() || "Minha loja"}
      whatsappDono={(perfilRes.data?.whatsapp as string | null) ?? null}
    />
  );
}
