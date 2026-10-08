import { createClient } from "@/lib/supabase/server";
import { podeVencer, type ContaTalvezRepasse } from "@/lib/repasse-marketplace";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { carregarVendasRelatorio } from "@/lib/relatorios-servidor";
import { hojeIsoBrasil, formatarDataIso, inicioDiaBrasil, somarDiasIso } from "@/lib/format";
import { carregarFontesPeriodo } from "@/lib/calendario-servidor";
import { CAMADAS_PADRAO, diasAte, type Camada } from "@/lib/calendario-dashboard";
import { lancarErroSupabase } from "@/lib/erros";
import { buscarEmLotes } from "@/lib/lotes";
import { avisoAtivacaoTeste } from "@/lib/ativacao-teste";
import type { ResumoAssinatura } from "@/lib/planos";
import type { PassoInicial } from "@/components/dashboard/PrimeirosPassos";
import { DashboardClient, type ProdutoBaixoEstoque, type Vencimento } from "./DashboardClient";
import { MasterDashboardClient } from "./MasterDashboardClient";
import type { ContaAdmin } from "../admin/AdminClient";
import type { LinhaHistorico } from "../admin/HistoricoAdmin";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home" };

function rotuloVencimento(dataVencimento: string): { status: string; tone: "negative" | "positive" | "neutral" } {
  // Hoje no Brasil: o relógio do servidor é UTC e, depois das 21h, "vence amanhã" virava "vence hoje".
  const diffDias = diasAte(hojeIsoBrasil(), dataVencimento.slice(0, 10));

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
  // Papel vem do middleware (sem nova ida ao Auth nem a `perfis_acesso`).
  const acesso = await acessoAtual();

  if (acesso?.papel === "master") {
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

  // Datas pelo calendário de Brasília: o servidor roda em UTC, e depois das 21h o "hoje"
  // dele já é amanhã (as vendas da noite caíam fora de "hoje" e o dia 1º sumia do mês).
  const hojeBr = hojeIsoBrasil();
  const inicioMesIso = `${hojeBr.slice(0, 7)}-01`;

  // Calendário: o mês de hoje (no Brasil) e o seguinte, para "Próximos 30 dias".
  const [anoCal, mesCal] = hojeBr.split("-").map(Number);
  const inicioCalendario = `${hojeBr.slice(0, 7)}-01`;
  const fimSeguinte = new Date(anoCal, mesCal + 1, 0);
  const fimCalendario = `${fimSeguinte.getFullYear()}-${String(fimSeguinte.getMonth() + 1).padStart(2, "0")}-${String(fimSeguinte.getDate()).padStart(2, "0")}`;

  // A janela de vendas começa no menor dos dois marcos (início do mês ou 7 dias
  // atrás) para que hoje/semana/mês saiam todos de uma consulta só.
  const inicioSemana = inicioDiaBrasil(somarDiasIso(hojeBr, -6));
  const inicioMesData = inicioDiaBrasil(inicioMesIso);
  const inicioVendas = inicioSemana < inicioMesData ? inicioSemana : inicioMesData;

  const [
    contasRes,
    produtosRes,
    pedidosRes,
    fornecedoresRes,
    cprRes,
    comprasMesRes,
    precificacoesMesRes,
    fontesCalendario,
    vendasRes,
    vendasRelatorio,
    perfilRes,
    lojasCountRes,
    vendasCountRes,
    mktCountRes,
    algumProdutoRes,
    assinaturaRes,
  ] = await Promise.all([
      supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
      // Só os candidatos a "Estoque baixo" (ativo e com mínimo definido — a comparação
      // `estoque <= estoque_minimo` é entre colunas, fica para depois), em lotes: antes era a
      // tabela inteira, cortada calada em 1000 linhas pelo PostgREST.
      buscarEmLotes<ProdutoBaixoEstoque>(async (de, ate) => {
        const r = await supabase
          .from("produtos")
          .select("id, sku, nome, estoque, estoque_minimo", { count: "exact" })
          .eq("ativo", true)
          .gt("estoque_minimo", 0)
          .order("estoque_minimo", { ascending: false })
          .order("id")
          .range(de, ate);
        return { data: r.data, error: r.error, count: r.count };
      }),
      supabase
        .from("pedidos_compra")
        .select("id, numero, valor_total, status, fornecedor_id")
        // Em aberto = para comprar, em trânsito ou parcial (0042).
        .in("status", ["pendente", "em_transito", "parcial"]),
      supabase.from("fornecedores").select("id, nome"),
      supabase
        .from("contas_a_pagar_receber")
        // `*`: valor_pago (pagamento parcial) só existe a partir da 0064. Folga para tirar os
        // repasses que aguardam a conclusão do pedido (0085) e ainda sobrar 8.
        .select("*")
        .eq("status", "pendente")
        .order("data_vencimento")
        .limit(60),
      supabase.from("pedidos_compra").select("valor_total").gte("data_pedido", inicioMesIso),
      supabase.from("precificacoes").select("id", { count: "exact", head: true }).gte("criado_em", inicioMesData.toISOString()),
      // O resto do calendário (os outros meses) vem sob demanda, ao navegar.
      carregarFontesPeriodo(supabase, inicioCalendario, fimCalendario),
      supabase
        .from("vendas")
        .select("total, lucro, data_venda")
        .neq("status", "cancelada")
        .gte("data_venda", inicioVendas.toISOString()),
      // Todas as origens (PDV, catálogo, Shopee) para o painel de vendas: este mês + o anterior.
      carregarVendasRelatorio(supabase, 62),
      // Primeiros passos: o que já está configurado. `*`: onboarding_oculto só a partir da 0065.
      supabase.from("perfil_negocio").select("*").maybeSingle(),
      supabase.from("lojas_canal").select("id", { count: "exact", head: true }),
      supabase.from("vendas").select("id", { count: "exact", head: true }),
      supabase.from("pedidos_marketplace").select("id", { count: "exact", head: true }),
      // Primeiros passos: basta saber se existe algum produto (inativo ou sem mínimo também conta).
      supabase.from("produtos").select("id").limit(1),
      // Aviso do teste grátis. Sem a 0057 (ou com erro), só não aparece.
      supabase.rpc("minha_assinatura"),
    ]);

  const perfil = perfilRes.data as Record<string, unknown> | null;
  const primeirosPassos: PassoInicial[] | null = perfil?.onboarding_oculto
    ? null
    : [
        { id: "loja", rotulo: "Dados da loja", ajuda: "Nome, regime e alíquota do imposto.", href: "/configuracoes?aba=conta", feito: !!String(perfil?.nome_negocio ?? "").trim() },
        { id: "conta", rotulo: "Conta de recebimento", ajuda: "Caixa, banco ou Pix onde o dinheiro entra.", href: "/configuracoes?aba=transacoes", feito: (contasRes.data ?? []).length > 0 },
        { id: "produto", rotulo: "Primeiro produto", ajuda: "Com custo, para o lucro sair certo.", href: "/produtos", feito: (algumProdutoRes.data ?? []).length > 0 },
        { id: "canal", rotulo: "Canal de venda", ajuda: "Shopee, Mercado Livre, catálogo ou loja física.", href: "/configuracoes?aba=canais-de-venda", feito: (lojasCountRes.count ?? 0) > 0 },
        { id: "venda", rotulo: "Primeira venda", ajuda: "Pelo PDV ou importando os pedidos.", href: "/pdv", feito: (vendasCountRes.count ?? 0) + (mktCountRes.count ?? 0) > 0 },
      ];

  const avisoTeste = avisoAtivacaoTeste(assinaturaRes.error ? null : (assinaturaRes.data as ResumoAssinatura | null), {
    temProduto: (produtosRes.data ?? []).length > 0,
    temVenda: (vendasCountRes.count ?? 0) + (mktCountRes.count ?? 0) > 0,
  });

  if (contasRes.error) throw new Error(contasRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (cprRes.error) throw new Error(cprRes.error.message);
  if (comprasMesRes.error) throw new Error(comprasMesRes.error.message);
  if (precificacoesMesRes.error) throw new Error(precificacoesMesRes.error.message);
  if (vendasRes.error) throw new Error(vendasRes.error.message);

  const inicioHoje = inicioDiaBrasil(hojeBr);

  const vendasNaJanela = (vendasRes.data ?? []).map((v) => ({ ...v, data: new Date(v.data_venda) }));
  const somar = (desde: Date) =>
    vendasNaJanela.filter((v) => v.data >= desde).reduce((acc, v) => acc + v.total, 0);

  // Resumo do mês com todas as origens (antes era só a tabela `vendas`, sem a Shopee).
  const doMes = vendasRelatorio.filter((v) => new Date(v.data) >= inicioMesData);
  const vendas = {
    hoje: somar(inicioHoje),
    semana: somar(inicioSemana),
    mes: doMes.reduce((acc, v) => acc + v.total, 0),
    lucroMes: doMes.reduce((acc, v) => acc + v.lucro, 0),
  };

  const resumoMes = {
    comprasMes: (comprasMesRes.data ?? []).reduce((acc, p) => acc + p.valor_total, 0),
    precificacoesMes: precificacoesMesRes.count ?? 0,
  };

  // Mesma regra do alerta de estoque mínimo (gatilho da 0034): produto ativo, com mínimo
  // definido e no mínimo ou abaixo. Antes entrava produto inativo e mínimo 0 com estoque 0.
  // (ativo e mínimo > 0 já vieram filtrados no banco.)
  const produtosBaixoEstoque = produtosRes.data.filter((p) => p.estoque <= p.estoque_minimo);

  const fornecedoresPorId = new Map((fornecedoresRes.data ?? []).map((f) => [f.id, f.nome]));
  const pedidosPendentes = (pedidosRes.data ?? []).map((p) => ({
    numero: p.numero,
    valor_total: p.valor_total,
    fornecedor_nome: (p.fornecedor_id && fornecedoresPorId.get(p.fornecedor_id)) ?? "—",
  }));

  const vencimentos: Vencimento[] = (cprRes.data ?? [])
    .filter((c) => podeVencer(c as ContaTalvezRepasse))
    .slice(0, 8)
    .map((c) => {
    const { status, tone } = rotuloVencimento(c.data_vencimento);
    return {
      status,
      tone,
      vencimento: formatarDataIso(c.data_vencimento),
      tipo: c.tipo === "pagar" ? "A Pagar" : "A Receber",
      descricao: c.descricao,
      // O que ainda falta (pagamento parcial, 0064/0083), nos dois sentidos.
      valor: (c.tipo === "pagar" ? -1 : 1) * Math.max(0, Number(c.valor) - Number(c.valor_pago ?? 0)),
    };
  });

  const camadasSalvas = Array.isArray(perfil?.calendario_camadas) ? (perfil.calendario_camadas as Camada[]).filter((c) => CAMADAS_PADRAO.includes(c)) : null;
  const calendario = {
    hoje: hojeBr,
    ufInicial: (perfil?.calendario_uf as string | null) ?? null,
    ufEmpresa: ((perfil?.uf as string | null) ?? "").toUpperCase() || null,
    camadasIniciais: camadasSalvas ?? CAMADAS_PADRAO,
    fontesIniciais: fontesCalendario,
  };

  return (
    <DashboardClient
      contas={contasRes.data ?? []}
      produtosBaixoEstoque={produtosBaixoEstoque}
      pedidosPendentes={pedidosPendentes}
      vencimentos={vencimentos}
      resumoMes={resumoMes}
      vendas={vendas}
      calendario={calendario}
      vendasRelatorio={vendasRelatorio}
      primeirosPassos={primeirosPassos}
      avisoTeste={avisoTeste}
    />
  );
}
