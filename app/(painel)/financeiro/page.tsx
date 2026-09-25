import { createClient } from "@/lib/supabase/server";
import { FinanceiroClient, type Movimentacao, type ContaPagarReceber } from "./FinanceiroClient";
import { calcularErosaoMargem, calcularPrevisaoRuptura } from "@/lib/alertas";
import { hojeIsoLocal } from "@/lib/format";
import { lancarErroSupabase } from "@/lib/erros";

interface CustoRecente {
  produto_id: string;
  produto_nome: string;
  custo_compra: number;
  custo_precificacao: number;
}

/** Totais agregados no banco — ver `resumo_financeiro` na migração 0022. */
export interface ResumoFinanceiro {
  total_entradas: number;
  total_saidas: number;
  saldo_liquido: number;
  entradas_com_lucro: number;
  saidas_com_lucro: number;
  quantidade: number;
}

const RESUMO_VAZIO: ResumoFinanceiro = {
  total_entradas: 0,
  total_saidas: 0,
  saldo_liquido: 0,
  entradas_com_lucro: 0,
  saidas_com_lucro: 0,
  quantidade: 0,
};

// Alias local. O `toISOString()` que havia aqui dava a data em UTC e, depois das 21h em
// Brasília, já apontava para o dia seguinte — deslocando toda a janela de consulta.
const isoDate = hojeIsoLocal;

export default async function FinanceiroPage() {
  const supabase = await createClient();

  const hoje = new Date();
  const inicio30Dias = new Date(hoje);
  inicio30Dias.setDate(inicio30Dias.getDate() - 29);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [
    contasRes,
    movimentacoesRes,
    despesasRes,
    cprRes,
    fluxoRes,
    despesasCatRes,
    produtosRes,
    custosRes,
    resumoRes,
    saidasEstoqueRes,
  ] = await Promise.all([
    supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
    supabase
      .from("movimentacoes_financeiras")
      .select("id, data_movimentacao, descricao, origem, categoria, conta_id, valor, afeta_lucro, referencia_despesa_fixa_id")
      .order("data_movimentacao", { ascending: false })
      .limit(100),
    supabase.from("despesas_fixas").select("id, nome, metodo, valor, dia_vencimento, conta_id").order("dia_vencimento"),
    supabase
      .from("contas_a_pagar_receber")
      .select("id, tipo, descricao, valor, data_vencimento, status, conta_id")
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
    supabase.from("produtos").select("id, nome, estoque").eq("ativo", true),
    // Antes eram duas varreduras totais aqui — `pedidos_compra_itens` e `precificacoes`
    // inteiras — para montar em memória um mapa de ~50 entradas. A RPC faz o mesmo com
    // `distinct on`, numa passada indexada.
    supabase.rpc("custos_recentes_por_produto"),
    // Totais somados no banco. O card "Saldo Líquido Realizado" somava o array de 100
    // lançamentos que a tela recebia, então o número ficava errado a partir do 101º — e
    // `numeric` do Postgres é exato, sem o acúmulo de centavos do float do JavaScript.
    supabase.rpc("resumo_financeiro", { p_inicio: null, p_fim: null }),
    supabase
      .from("estoque_movimentacoes")
      .select("produto_id, quantidade")
      .eq("tipo", "saida")
      .gte("data_movimentacao", isoDate(inicio30Dias)),
  ]);

  // Só as consultas ESSENCIAIS derrubam a tela. Antes eram 11 `throw`: uma falha em
  // `precificacoes` — que alimenta apenas o card de erosão de margem — apagava saldo, fluxo
  // de caixa, contas a pagar e lançamentos junto.
  if (contasRes.error) lancarErroSupabase(contasRes.error);
  if (movimentacoesRes.error) lancarErroSupabase(movimentacoesRes.error);
  if (despesasRes.error) lancarErroSupabase(despesasRes.error);
  if (cprRes.error) lancarErroSupabase(cprRes.error);

  // Secundárias: se falharem, a tela carrega sem o card correspondente.
  for (const [nome, res] of [
    ["fluxo de caixa", fluxoRes],
    ["despesas por categoria", despesasCatRes],
    ["produtos", produtosRes],
    ["custos recentes", custosRes],
    ["resumo financeiro", resumoRes],
    ["saídas de estoque", saidasEstoqueRes],
  ] as const) {
    if (res.error) console.error(`[financeiro] falha ao carregar ${nome}:`, res.error.message);
  }

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

  const contasPorId = new Map((contasRes.data ?? []).map((c) => [c.id, c.nome]));

  const movimentacoes: Movimentacao[] = (movimentacoesRes.data ?? []).map((m) => ({
    id: m.id,
    data_movimentacao: m.data_movimentacao,
    descricao: m.descricao,
    origem: m.origem,
    categoria: m.categoria,
    conta_id: m.conta_id,
    conta_nome: (m.conta_id && contasPorId.get(m.conta_id)) ?? "—",
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
    conta_nome: (c.conta_id && contasPorId.get(c.conta_id)) ?? null,
  }));

  // Erosão de margem: cruza a compra recebida mais recente de cada produto com o custo da
  // última precificação salva. A RPC já devolve os dois lados prontos, um registro por SKU.
  const comprasRecentesPorProduto = new Map<string, { custo_unitario: number; produto_nome: string }>();
  const precificacoesRecentesPorProduto = new Map<string, { custo: number }>();
  for (const c of (custosRes.data ?? []) as CustoRecente[]) {
    comprasRecentesPorProduto.set(c.produto_id, { custo_unitario: c.custo_compra, produto_nome: c.produto_nome });
    precificacoesRecentesPorProduto.set(c.produto_id, { custo: c.custo_precificacao });
  }

  const alertasErosaoMargem = calcularErosaoMargem(precificacoesRecentesPorProduto, comprasRecentesPorProduto);

  const saidasPorProduto = new Map<string, number>();
  for (const s of saidasEstoqueRes.data ?? []) {
    if (!s.produto_id) continue;
    saidasPorProduto.set(s.produto_id, (saidasPorProduto.get(s.produto_id) ?? 0) + s.quantidade);
  }
  const alertasRupturaEstoque = calcularPrevisaoRuptura(produtosRes.data ?? [], saidasPorProduto);

  return (
    <FinanceiroClient
      contas={contasRes.data ?? []}
      movimentacoes={movimentacoes}
      despesasFixas={despesasRes.data ?? []}
      contasPagarReceber={contasPagarReceber}
      fluxoCaixaDiario={fluxoCaixaDiario}
      despesasPorCategoria={despesasPorCategoria}
      alertasErosaoMargem={alertasErosaoMargem}
      alertasRupturaEstoque={alertasRupturaEstoque}
      resumo={((resumoRes.data as ResumoFinanceiro[] | null)?.[0]) ?? RESUMO_VAZIO}
    />
  );
}
