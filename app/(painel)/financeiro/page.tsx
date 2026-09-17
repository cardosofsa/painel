import { createClient } from "@/lib/supabase/server";
import { FinanceiroClient, type Movimentacao, type ContaPagarReceber } from "./FinanceiroClient";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function FinanceiroPage() {
  const supabase = await createClient();

  const hoje = new Date();
  const inicio30Dias = new Date(hoje);
  inicio30Dias.setDate(inicio30Dias.getDate() - 29);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [contasRes, movimentacoesRes, despesasRes, cprRes, fluxoRes, despesasCatRes] = await Promise.all([
    supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
    supabase
      .from("movimentacoes_financeiras")
      .select("id, data_movimentacao, descricao, origem, categoria, conta_id, valor, afeta_lucro, referencia_despesa_fixa_id, contas(nome)")
      .order("data_movimentacao", { ascending: false })
      .limit(100),
    supabase.from("despesas_fixas").select("id, nome, metodo, valor, dia_vencimento, conta_id").order("dia_vencimento"),
    supabase
      .from("contas_a_pagar_receber")
      .select("id, tipo, descricao, valor, data_vencimento, status, conta_id, contas(nome)")
      .order("data_vencimento"),
    supabase
      .from("movimentacoes_financeiras")
      .select("data_movimentacao, valor")
      .gte("data_movimentacao", isoDate(inicio30Dias)),
    supabase
      .from("movimentacoes_financeiras")
      .select("valor, categoria")
      .eq("tipo", "saida")
      .gte("data_movimentacao", isoDate(inicioMes)),
  ]);

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (despesasRes.error) throw new Error(despesasRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);
  if (fluxoRes.error) throw new Error(fluxoRes.error.message);
  if (despesasCatRes.error) throw new Error(despesasCatRes.error.message);

  const mapaFluxo = new Map<string, { entradas: number; saidas: number }>();
  for (const m of fluxoRes.data ?? []) {
    const atual = mapaFluxo.get(m.data_movimentacao) ?? { entradas: 0, saidas: 0 };
    if (m.valor >= 0) atual.entradas += m.valor;
    else atual.saidas += Math.abs(m.valor);
    mapaFluxo.set(m.data_movimentacao, atual);
  }
  const fluxoCaixaDiario = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(inicio30Dias);
    d.setDate(d.getDate() + i);
    const chave = isoDate(d);
    const v = mapaFluxo.get(chave) ?? { entradas: 0, saidas: 0 };
    return { dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), entradas: v.entradas, saidas: v.saidas };
  });

  const mapaCategorias = new Map<string, number>();
  for (const m of despesasCatRes.data ?? []) {
    const categoria = m.categoria || "Outros";
    mapaCategorias.set(categoria, (mapaCategorias.get(categoria) ?? 0) + Math.abs(m.valor));
  }
  const despesasPorCategoria = Array.from(mapaCategorias.entries())
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);

  const movimentacoes: Movimentacao[] = (movimentacoesRes.data ?? []).map((m) => ({
    id: m.id,
    data_movimentacao: m.data_movimentacao,
    descricao: m.descricao,
    origem: m.origem,
    categoria: m.categoria,
    conta_id: m.conta_id,
    conta_nome: (m.contas as unknown as { nome: string }[] | null)?.[0]?.nome ?? "—",
    valor: m.valor,
    afeta_lucro: m.afeta_lucro,
    referencia_despesa_fixa_id: m.referencia_despesa_fixa_id,
  }));

  const contasPagarReceber: ContaPagarReceber[] = (cprRes.data ?? []).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    descricao: c.descricao,
    valor: c.valor,
    data_vencimento: c.data_vencimento,
    status: c.status,
    conta_id: c.conta_id,
    conta_nome: (c.contas as unknown as { nome: string }[] | null)?.[0]?.nome ?? null,
  }));

  return (
    <FinanceiroClient
      contas={contasRes.data ?? []}
      movimentacoes={movimentacoes}
      despesasFixas={despesasRes.data ?? []}
      contasPagarReceber={contasPagarReceber}
      fluxoCaixaDiario={fluxoCaixaDiario}
      despesasPorCategoria={despesasPorCategoria}
    />
  );
}
