import { createClient } from "@/lib/supabase/server";
import { eRepasseMarketplace } from "@/lib/repasse-marketplace";
import { FinanceiroClient, type Movimentacao, type ContaPagarReceber, type ItemHistorico } from "./FinanceiroClient";
import { hojeIsoBrasil, hojeIsoLocal } from "@/lib/format";
import { lancarErroSupabase } from "@/lib/erros";
import { carregarCrediario } from "@/lib/crediario-servidor";
import type { GastoAnuncio } from "@/components/financeiro/AbaResultado";
import type { Metadata } from "next";
import { ocorrenciasDespesasFixas } from "@/lib/despesas-fixas-calendario";
import type { ContaCalendarioFonte } from "@/lib/calendario-contas";

export const metadata: Metadata = { title: "Financeiro" };

/** Formato cru do join com `vendas`, antes de virar `ContaPagarReceber`. */
interface LinhaCpr {
  /** 0085; ausente antes da migração. */
  aguardando_liberacao?: boolean | null;
  /** 0087; ausente antes da migração. */
  referencia_pedido_marketplace_id?: string | null;
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: "pendente" | "pago" | "recebido";
  conta_id: string | null;
  referencia_venda_id: string | null;
  vendas: { numero: string; total_parcelas_fiado: number | null } | null;
  /** 0064 (antes da migração não vêm: valem 0/null). */
  valor_pago?: number | null;
  data_pagamento?: string | null;
  parcela_numero?: number | null;
  total_parcelas?: number | null;
  referencia_pedido_compra_id: string | null;
  pedidos_compra: { numero: string; fornecedores: { nome: string } | null } | null;
  /** 0018 / 0067: dono da conta avulsa ou da dívida antiga. */
  cliente_id?: string | null;
  fornecedor_id?: string | null;
  /** Nome do cliente (FK da 0018), embutido na mesma consulta. */
  clientes?: { nome: string } | null;
}

interface PagamentoBruto {
  id: string;
  valor: number;
  data: string;
  contas: { nome: string } | null;
  contas_a_pagar_receber: { descricao: string; status: string; pedidos_compra: { numero: string; fornecedores: { nome: string } | null } | null } | null;
}

interface ParcelaRecebidaBruta {
  id: string;
  numero: number;
  total_parcelas: number;
  valor_pago: number | null;
  valor: number;
  data_pagamento: string | null;
  conta_id: string | null;
  vendas: { numero: string; cliente_nome: string | null } | null;
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

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const supabase = await createClient();

  // Hoje pelo calendário de Brasília, como data local (meio-dia, sem risco de virar o dia):
  // o servidor roda em UTC e, depois das 21h, o new Date() dele já é amanhã.
  const [anoBr, mesBr, diaBr] = hojeIsoBrasil().split("-").map(Number);
  const hoje = new Date(anoBr, mesBr - 1, diaBr, 12);
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
    resumoRes,
    pagamentosRes,
    parcelasRecebidasRes,
    crediario,
    dreRes,
    gastosRes,
    lojasRes,
    fornecedoresRes,
    clientesRes,
    fixasPagasRes,
    parcelasCalRes,
  ] = await Promise.all([
    supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
    supabase
      .from("movimentacoes_financeiras")
      .select("id, data_movimentacao, descricao, origem, categoria, conta_id, valor, afeta_lucro, referencia_despesa_fixa_id")
      .order("data_movimentacao", { ascending: false })
      .limit(100),
    supabase.from("despesas_fixas").select("id, nome, metodo, valor, dia_vencimento, conta_id, criado_em").order("dia_vencimento"),
    supabase
      .from("contas_a_pagar_receber")
      // `*`: valor_pago, data_pagamento e parcela só existem a partir da 0064.
      .select("*, vendas(numero, total_parcelas_fiado), pedidos_compra(numero, fornecedores(nome)), clientes(nome)")
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
    // Totais somados no banco. O card "Saldo Líquido Realizado" somava o array de 100
    // lançamentos que a tela recebia, então o número ficava errado a partir do 101º — e
    // `numeric` do Postgres é exato, sem o acúmulo de centavos do float do JavaScript.
    supabase.rpc("resumo_financeiro", { p_inicio: null, p_fim: null }),
    // Histórico de pagamentos (0064) e parcelas de crediário recebidas: o que saiu e entrou, com data.
    supabase
      .from("pagamentos_conta")
      .select("id, valor, data, contas(nome), contas_a_pagar_receber(descricao, status, pedidos_compra(numero, fornecedores(nome)))")
      .order("data", { ascending: false })
      .limit(300),
    supabase
      .from("venda_parcelas")
      .select("id, numero, total_parcelas, valor, valor_pago, data_pagamento, conta_id, vendas(numero, cliente_nome)")
      .eq("status", "paga")
      .order("data_pagamento", { ascending: false })
      .limit(300),
    carregarCrediario(supabase),
    // Resultado (0066): os últimos 6 meses, somados no banco.
    supabase.rpc("dre_mensal", { p_inicio: hojeIsoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)), p_fim: hojeIsoLocal(hoje) }),
    supabase.from("gastos_anuncios").select("id, periodo_inicio, periodo_fim, canal, campanha, valor, pedidos, vendas, origem").order("periodo_fim", { ascending: false }).limit(200),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    // Para "Lançar dívida antiga" (0067) e para dar nome a conta ligada direto a eles.
    supabase.from("fornecedores").select("id, nome").order("nome"),
    // Só o seletor da dívida antiga usa esta lista — e só cliente ativo, como no PDV. O
    // nome do cliente de cada conta vem embutido na própria consulta de contas acima, então
    // não é mais preciso trazer a tabela de clientes inteira.
    supabase.from("clientes").select("id, nome").eq("status", "ativo").order("nome"),
    // Calendário de contas: lançamentos que pagaram despesa fixa (marca o mês como pago)…
    supabase
      .from("movimentacoes_financeiras")
      .select("referencia_despesa_fixa_id, data_movimentacao")
      .not("referencia_despesa_fixa_id", "is", null)
      .gte("data_movimentacao", hojeIsoLocal(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)))
      .limit(1000),
    // …e parcelas de crediário (a conta "pai" da venda parcelada é a soma delas).
    supabase
      .from("venda_parcelas")
      .select("id, numero, total_parcelas, valor, valor_pago, data_vencimento, status, vendas(numero, cliente_nome, status)")
      .gte("data_vencimento", hojeIsoLocal(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)))
      .limit(2000),
  ]);
  const fornecedores = (fornecedoresRes.data ?? []) as { id: string; nome: string }[];
  const clientes = (clientesRes.data ?? []) as { id: string; nome: string }[];
  const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));

  const lojasMarketplace = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({ id: l.id, nome: l.nome, canal: l.canais?.nome ?? "Loja" }));

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
    ["resumo financeiro", resumoRes],
    ["histórico de pagamentos", pagamentosRes],
    ["parcelas recebidas", parcelasRecebidasRes],
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

  const contasPagarReceber: ContaPagarReceber[] = ((cprRes.data ?? []) as unknown as LinhaCpr[]).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    descricao: c.descricao,
    valor: c.valor,
    data_vencimento: c.data_vencimento,
    status: c.status,
    conta_id: c.conta_id,
    conta_nome: (c.conta_id && contasPorId.get(c.conta_id)) ?? null,
    venda_id: c.referencia_venda_id,
    venda_numero: c.vendas?.numero ?? null,
    total_parcelas_fiado: c.vendas?.total_parcelas_fiado ?? null,
    // Antes da 0064 não há valor_pago: quitada = pago inteiro.
    valor_pago: Number(c.valor_pago ?? (c.status === "pendente" ? 0 : c.valor)),
    data_pagamento: c.data_pagamento ?? null,
    parcela_numero: c.parcela_numero ?? null,
    total_parcelas: c.total_parcelas ?? null,
    pedido_id: c.referencia_pedido_compra_id ?? null,
    pedido_numero: c.pedidos_compra?.numero ?? null,
    fornecedor_nome: c.pedidos_compra?.fornecedores?.nome ?? (c.fornecedor_id ? (nomeFornecedor.get(c.fornecedor_id) ?? null) : null),
    cliente_id: c.cliente_id ?? null,
    cliente_nome: c.clientes?.nome ?? (c.cliente_id ? (nomeCliente.get(c.cliente_id) ?? null) : null),
    aguardando_liberacao: !!c.aguardando_liberacao,
    repasse_marketplace: eRepasseMarketplace(c),
  }));

  // Calendário de contas: contas, parcelas de crediário e despesas fixas projetadas
  // (de 12 meses atrás a 12 meses à frente), com o status de cada uma.
  type ParcelaCal = { id: string; numero: number; total_parcelas: number; valor: number; valor_pago: number | null; data_vencimento: string; status: string; vendas: { numero: string; cliente_nome: string | null; status: string } | null };
  const calendarioContas: ContaCalendarioFonte[] = [
    ...contasPagarReceber
      .filter((c) => (c.total_parcelas_fiado ?? 1) <= 1 && !c.repasse_marketplace)
      .map((c) => ({
        id: c.id,
        tipo: c.tipo,
        descricao: c.descricao,
        valor: Number(c.valor),
        valorAberto: Number(c.valor) - c.valor_pago,
        data_vencimento: c.data_vencimento,
        quitada: c.status !== "pendente",
        origem: "conta" as const,
      })),
    ...((parcelasCalRes.error ? [] : (parcelasCalRes.data ?? [])) as unknown as ParcelaCal[])
      .filter((p) => p.vendas?.status !== "cancelada" && p.status !== "cancelada")
      .map((p) => ({
        id: p.id,
        tipo: "receber" as const,
        descricao: `Venda ${p.vendas?.numero ?? ""} — parcela ${p.numero}/${p.total_parcelas}${p.vendas?.cliente_nome ? ` · ${p.vendas.cliente_nome}` : ""}`,
        valor: Number(p.valor),
        valorAberto: Number(p.valor) - Number(p.valor_pago ?? 0),
        data_vencimento: p.data_vencimento,
        quitada: p.status === "paga",
        origem: "parcela" as const,
      })),
    ...ocorrenciasDespesasFixas(
      (despesasRes.data ?? []) as { id: string; nome: string; valor: number; dia_vencimento: number; criado_em: string | null }[],
      hojeIsoLocal(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)),
      hojeIsoLocal(new Date(hoje.getFullYear() + 1, hoje.getMonth() + 1, 0)),
      ((fixasPagasRes.error ? [] : fixasPagasRes.data) ?? []).map((m) => ({ despesa_id: String(m.referencia_despesa_fixa_id), data: String(m.data_movimentacao) })),
      contasPagarReceber,
    ).map((o) => ({
      id: o.id,
      tipo: "pagar" as const,
      descricao: o.descricao,
      valor: o.valor,
      valorAberto: o.paga ? 0 : o.valor,
      data_vencimento: o.data_vencimento,
      quitada: o.paga,
      origem: "fixa" as const,
    })),
  ];

  // Histórico: pagamentos a fornecedores/contas (0064) + recebimentos de crediário.
  const historico: ItemHistorico[] = [
    ...((pagamentosRes.data ?? []) as unknown as PagamentoBruto[]).map((g) => ({
      id: `pag:${g.id}`,
      tipo: "pago" as const,
      data: g.data,
      valor: Number(g.valor),
      descricao: g.contas_a_pagar_receber?.descricao ?? "Pagamento",
      quem: g.contas_a_pagar_receber?.pedidos_compra?.fornecedores?.nome ?? null,
      conta: g.contas?.nome ?? null,
      quitado: g.contas_a_pagar_receber?.status !== "pendente",
    })),
    ...((parcelasRecebidasRes.data ?? []) as unknown as ParcelaRecebidaBruta[])
      .filter((p) => p.data_pagamento)
      .map((p) => ({
        id: `parc:${p.id}`,
        tipo: "recebido" as const,
        data: p.data_pagamento as string,
        valor: Number(p.valor_pago ?? p.valor),
        descricao: `Venda ${p.vendas?.numero ?? ""} — parcela ${p.numero}/${p.total_parcelas}`,
        quem: p.vendas?.cliente_nome ?? null,
        conta: (p.conta_id && contasPorId.get(p.conta_id)) ?? null,
        quitado: true,
      })),
    // Crediário de parcela única recebido pelo "Marcar recebido" (data gravada a partir da 0064).
    ...contasPagarReceber
      .filter((c) => c.tipo === "receber" && c.status === "recebido" && c.data_pagamento && (c.total_parcelas_fiado ?? 1) <= 1)
      .map((c) => ({
        id: `cpr:${c.id}`,
        tipo: "recebido" as const,
        data: c.data_pagamento as string,
        valor: c.valor,
        descricao: c.descricao,
        quem: null,
        conta: c.conta_nome,
        quitado: true,
      })),
  ].sort((a, b) => b.data.localeCompare(a.data));


  return (
    <FinanceiroClient
      // Remonta ao trocar de `?aba=` (link da Vixe estando já no Financeiro).
      key={aba ?? "visao"}
      contas={contasRes.data ?? []}
      movimentacoes={movimentacoes}
      despesasFixas={despesasRes.data ?? []}
      contasPagarReceber={contasPagarReceber}
      fluxoCaixaDiario={fluxoCaixaDiario}
      despesasPorCategoria={despesasPorCategoria}
      resumo={((resumoRes.data as ResumoFinanceiro[] | null)?.[0]) ?? RESUMO_VAZIO}
      historico={historico}
      historicoOk={!pagamentosRes.error}
      regraCrediario={crediario.regra}
      abaUrl={aba}
      dre={((dreRes.data ?? []) as Record<string, unknown>[]).map((d) => ({
        mes: String(d.mes).slice(0, 10),
        receita_bruta: Number(d.receita_bruta),
        descontos: Number(d.descontos),
        devolucoes: Number(d.devolucoes),
        impostos: Number(d.impostos),
        taxas_marketplace: Number(d.taxas_marketplace),
        taxa_maquininha: Number(d.taxa_maquininha),
        frete: Number(d.frete),
        cmv: Number(d.cmv),
        anuncios: Number(d.anuncios),
        despesas: Number(d.despesas),
        outras_receitas: Number(d.outras_receitas),
        lucro_liquido: Number(d.lucro_liquido),
        pedidos: Number(d.pedidos),
      }))}
      gastosAnuncios={((gastosRes.data ?? []) as GastoAnuncio[]).map((g) => ({ ...g, valor: Number(g.valor), vendas: g.vendas == null ? null : Number(g.vendas) }))}
      lojasMarketplace={lojasMarketplace}
      anunciosOk={!gastosRes.error && !dreRes.error}
      fornecedores={fornecedores}
      clientes={clientes}
      calendarioContas={calendarioContas}
      hoje={hojeIsoBrasil()}
    />
  );
}
