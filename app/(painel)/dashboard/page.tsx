import { createClient } from "@/lib/supabase/server";
import { DashboardClient, type Vencimento, type Compromisso } from "./DashboardClient";

function rotuloVencimento(dataVencimento: string): { status: string; tone: "negative" | "positive" | "neutral" } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + "T00:00:00");
  const diffDias = Math.round((venc.getTime() - hoje.getTime()) / 86400000);

  if (diffDias < 0) return { status: "Atrasado", tone: "negative" };
  if (diffDias === 0) return { status: "Vence hoje", tone: "negative" };
  if (diffDias === 1) return { status: "Vence amanhã", tone: "negative" };
  if (diffDias <= 7) return { status: `Em ${diffDias} dias`, tone: "positive" };
  return { status: "Programado", tone: "neutral" };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesIso = inicioMes.toISOString().slice(0, 10);

  const [contasRes, produtosRes, pedidosRes, fornecedoresRes, cprRes, comprasMesRes, precificacoesMesRes, compromissosRes] =
    await Promise.all([
      supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
      supabase
        .from("produtos")
        .select("id, sku, nome, estoque, estoque_minimo")
        .order("estoque_minimo", { ascending: false }),
      supabase
        .from("pedidos_compra")
        .select("id, numero, valor_total, status, fornecedor_id")
        .eq("status", "pendente"),
      supabase.from("fornecedores").select("id, nome"),
      supabase
        .from("contas_a_pagar_receber")
        .select("id, tipo, descricao, valor, data_vencimento, status")
        .eq("status", "pendente")
        .order("data_vencimento")
        .limit(8),
      supabase.from("pedidos_compra").select("valor_total").gte("data_pedido", inicioMesIso),
      supabase.from("precificacoes").select("id", { count: "exact", head: true }).gte("criado_em", inicioMesIso),
      supabase.from("compromissos").select("id, titulo, data, hora, descricao").order("data").order("hora"),
    ]);

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);
  if (comprasMesRes.error) throw new Error(comprasMesRes.error.message);
  if (precificacoesMesRes.error) throw new Error(precificacoesMesRes.error.message);
  if (compromissosRes.error) throw new Error(compromissosRes.error.message);

  const resumoMes = {
    comprasMes: (comprasMesRes.data ?? []).reduce((acc, p) => acc + p.valor_total, 0),
    precificacoesMes: precificacoesMesRes.count ?? 0,
  };

  const produtosBaixoEstoque = (produtosRes.data ?? []).filter((p) => p.estoque <= p.estoque_minimo);

  const fornecedoresPorId = new Map((fornecedoresRes.data ?? []).map((f) => [f.id, f.nome]));
  const pedidosPendentes = (pedidosRes.data ?? []).map((p) => ({
    numero: p.numero,
    valor_total: p.valor_total,
    fornecedor_nome: (p.fornecedor_id && fornecedoresPorId.get(p.fornecedor_id)) ?? "—",
  }));

  const vencimentos: Vencimento[] = (cprRes.data ?? []).map((c) => {
    const { status, tone } = rotuloVencimento(c.data_vencimento);
    return {
      status,
      tone,
      vencimento: new Date(c.data_vencimento).toLocaleDateString("pt-BR"),
      tipo: c.tipo === "pagar" ? "A Pagar" : "A Receber",
      descricao: c.descricao,
      valor: c.tipo === "pagar" ? -c.valor : c.valor,
    };
  });

  const compromissos: Compromisso[] = compromissosRes.data ?? [];

  return (
    <DashboardClient
      contas={contasRes.data ?? []}
      produtosBaixoEstoque={produtosBaixoEstoque}
      pedidosPendentes={pedidosPendentes}
      vencimentos={vencimentos}
      resumoMes={resumoMes}
      compromissos={compromissos}
    />
  );
}
