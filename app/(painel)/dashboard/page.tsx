import { createClient } from "@/lib/supabase/server";
import { hojeIsoLocal, formatarDataIso, dataLocal } from "@/lib/format";
import { lancarErroSupabase } from "@/lib/erros";
import { DashboardClient, type Vencimento, type Compromisso } from "./DashboardClient";
import { MasterDashboardClient } from "./MasterDashboardClient";
import type { ContaAdmin } from "../admin/AdminClient";
import type { LinhaHistorico } from "../admin/HistoricoAdmin";

function rotuloVencimento(dataVencimento: string): { status: string; tone: "negative" | "positive" | "neutral" } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = dataLocal(dataVencimento);
  const diffDias = Math.round((venc.getTime() - hoje.getTime()) / 86400000);

  if (diffDias < 0) return { status: "Atrasado", tone: "negative" };
  if (diffDias === 0) return { status: "Vence hoje", tone: "negative" };
  if (diffDias === 1) return { status: "Vence amanhã", tone: "negative" };
  if (diffDias <= 7) return { status: `Em ${diffDias} dias`, tone: "positive" };
  return { status: "Programado", tone: "neutral" };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Master administra o sistema, não roda negócio nenhum por esta conta — a dashboard de
  // negócio (vendas hoje/semana/mês, estoque baixo, vencimentos) ficaria toda zerada e sem
  // sentido para ela. Consulta pequena e cedo, antes do Promise.all grande de negócio, que
  // nem chega a rodar para master.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("perfis_acesso")
    .select("papel")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  if (perfil?.papel === "master") {
    const [contasRes, historicoRes] = await Promise.all([
      supabase.rpc("admin_listar_contas"),
      supabase
        .from("historico_admin")
        .select("id, admin_email, alvo_user_id, alvo_email, acao, detalhes, criado_em")
        .order("criado_em", { ascending: false })
        .limit(5),
    ]);

    if (contasRes.error) lancarErroSupabase(contasRes.error);
    if (historicoRes.error) console.error("[dashboard/master] falha ao carregar histórico:", historicoRes.error.message);

    return (
      <MasterDashboardClient
        contas={(contasRes.data ?? []) as ContaAdmin[]}
        historico={(historicoRes.data ?? []) as LinhaHistorico[]}
      />
    );
  }

  // O antigo toISOString() convertia para UTC: no dia 1º às 22h em Brasília ele já
  // devolvia o dia 2, e as compras/precificações do dia 1º sumiam do resumo do mês.
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesIso = hojeIsoLocal(inicioMes);

  const inicioAgenda = new Date();
  inicioAgenda.setDate(inicioAgenda.getDate() - 45);
  const fimAgenda = new Date();
  fimAgenda.setDate(fimAgenda.getDate() + 45);
  const inicioAgendaIso = hojeIsoLocal(inicioAgenda);
  const fimAgendaIso = hojeIsoLocal(fimAgenda);

  // A janela de vendas começa no menor dos dois marcos (início do mês ou 7 dias
  // atrás) para que hoje/semana/mês saiam todos de uma consulta só.
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - 6);
  inicioSemana.setHours(0, 0, 0, 0);
  const inicioMesData = new Date(inicioMes);
  inicioMesData.setHours(0, 0, 0, 0);
  const inicioVendas = inicioSemana < inicioMesData ? inicioSemana : inicioMesData;

  const [
    contasRes,
    produtosRes,
    pedidosRes,
    fornecedoresRes,
    cprRes,
    comprasMesRes,
    precificacoesMesRes,
    compromissosRes,
    vendasRes,
  ] = await Promise.all([
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
      // O card da agenda só desenha o mês corrente; sem janela, esta consulta trazia a
      // agenda inteira, de todos os anos. Uma folga de 45 dias cobre a navegação para o
      // mês anterior e o seguinte.
      supabase
        .from("compromissos")
        .select("id, titulo, data, hora, descricao")
        .gte("data", inicioAgendaIso)
        .lte("data", fimAgendaIso)
        .order("data")
        .order("hora"),
      supabase
        .from("vendas")
        .select("total, lucro, data_venda")
        .neq("status", "cancelada")
        .gte("data_venda", inicioVendas.toISOString()),
    ]);

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);
  if (comprasMesRes.error) throw new Error(comprasMesRes.error.message);
  if (precificacoesMesRes.error) throw new Error(precificacoesMesRes.error.message);
  if (compromissosRes.error) throw new Error(compromissosRes.error.message);
  if (vendasRes.error) throw new Error(vendasRes.error.message);

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const vendasNaJanela = (vendasRes.data ?? []).map((v) => ({ ...v, data: new Date(v.data_venda) }));
  const somar = (desde: Date) =>
    vendasNaJanela.filter((v) => v.data >= desde).reduce((acc, v) => acc + v.total, 0);

  const vendas = {
    hoje: somar(inicioHoje),
    semana: somar(inicioSemana),
    mes: somar(inicioMesData),
    lucroMes: vendasNaJanela
      .filter((v) => v.data >= inicioMesData)
      .reduce((acc, v) => acc + v.lucro, 0),
  };

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
      vencimento: formatarDataIso(c.data_vencimento),
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
      vendas={vendas}
      compromissos={compromissos}
    />
  );
}
