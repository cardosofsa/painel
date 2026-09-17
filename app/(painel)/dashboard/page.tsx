import { createClient } from "@/lib/supabase/server";
import { DashboardClient, type Vencimento } from "./DashboardClient";

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

  const [contasRes, produtosRes, pedidosRes, cprRes] = await Promise.all([
    supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
    supabase
      .from("produtos")
      .select("id, sku, nome, estoque, estoque_minimo")
      .order("estoque_minimo", { ascending: false }),
    supabase
      .from("pedidos_compra")
      .select("id, numero, valor_total, status, fornecedores(nome)")
      .eq("status", "pendente"),
    supabase
      .from("contas_a_pagar_receber")
      .select("id, tipo, descricao, valor, data_vencimento, status")
      .eq("status", "pendente")
      .order("data_vencimento")
      .limit(8),
  ]);

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);

  const produtosBaixoEstoque = (produtosRes.data ?? []).filter((p) => p.estoque <= p.estoque_minimo);

  const pedidosPendentes = (pedidosRes.data ?? []).map((p) => ({
    numero: p.numero,
    valor_total: p.valor_total,
    fornecedor_nome: (p.fornecedores as unknown as { nome: string }[] | null)?.[0]?.nome ?? "—",
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

  return (
    <DashboardClient
      contas={contasRes.data ?? []}
      produtosBaixoEstoque={produtosBaixoEstoque}
      pedidosPendentes={pedidosPendentes}
      vencimentos={vencimentos}
    />
  );
}
