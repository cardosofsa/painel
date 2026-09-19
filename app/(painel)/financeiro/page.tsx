import { createClient } from "@/lib/supabase/server";
import { FinanceiroClient, type Movimentacao, type ContaPagarReceber } from "./FinanceiroClient";
import { calcularErosaoMargem, calcularPrevisaoRuptura } from "@/lib/alertas";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
    pedidosRecebidosRes,
    itensCompraRes,
    precificacoesRes,
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
    supabase.from("pedidos_compra").select("id, data_recebimento").eq("status", "recebido"),
    supabase.from("pedidos_compra_itens").select("produto_id, produto_nome, custo_unitario, pedido_compra_id"),
    supabase.from("precificacoes").select("produto_id, custo, criado_em").not("produto_id", "is", null).order("criado_em", { ascending: false }),
    supabase
      .from("estoque_movimentacoes")
      .select("produto_id, quantidade")
      .eq("tipo", "saida")
      .gte("data_movimentacao", isoDate(inicio30Dias)),
  ]);

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (despesasRes.error) throw new Error(despesasRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (pedidosRecebidosRes.error) throw new Error(pedidosRecebidosRes.error.message);
  if (itensCompraRes.error) throw new Error(itensCompraRes.error.message);
  if (precificacoesRes.error) throw new Error(precificacoesRes.error.message);
  if (saidasEstoqueRes.error) throw new Error(saidasEstoqueRes.error.message);
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

  // Erosão de margem: cruza a compra recebida mais recente de cada produto com o custo da última precificação salva.
  const dataRecebimentoPorPedido = new Map((pedidosRecebidosRes.data ?? []).map((p) => [p.id, p.data_recebimento]));
  const comprasRecentesPorProduto = new Map<string, { custo_unitario: number; produto_nome: string; data: string }>();
  for (const item of itensCompraRes.data ?? []) {
    if (!item.produto_id) continue;
    const data = dataRecebimentoPorPedido.get(item.pedido_compra_id);
    if (!data) continue;
    const atual = comprasRecentesPorProduto.get(item.produto_id);
    if (!atual || data > atual.data) {
      comprasRecentesPorProduto.set(item.produto_id, { custo_unitario: item.custo_unitario, produto_nome: item.produto_nome, data });
    }
  }

  const precificacoesRecentesPorProduto = new Map<string, { custo: number }>();
  for (const p of precificacoesRes.data ?? []) {
    if (!p.produto_id || precificacoesRecentesPorProduto.has(p.produto_id)) continue;
    precificacoesRecentesPorProduto.set(p.produto_id, { custo: p.custo });
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
    />
  );
}
