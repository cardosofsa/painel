"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Wallet, Receipt, AlertTriangle, ShieldCheck, Download, History } from "lucide-react";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { formatBRL, formatarDataIso, hojeIsoLocal, classeValor } from "@/lib/format";
import { matrizParaCsv, baixarArquivo } from "@/lib/csv";
import type { ResumoFinanceiro } from "./page";
import {
  criarMovimentacao,
  criarDespesaFixa,
  retirarDespesaDaConta,
  desfazerRetiradaDespesa,
  criarContaPagarReceber,
  type MovimentacaoInput,
  type DespesaFixaInput,
  type ContaPagarReceberInput,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { LimparDadosModal } from "@/components/financeiro/LimparDadosModal";
import { NovaMovimentacaoModal, NovaDespesaFixaModal, NovaCprModal } from "@/components/financeiro/ModaisFinanceiro";
import { ParcelasVendaModal } from "@/components/financeiro/ParcelasVendaModal";
import { HistoricoPagamentosModal } from "@/components/financeiro/HistoricoPagamentos";
import { ReceberContaModal, type ContaParaReceber } from "@/components/financeiro/ReceberContaModal";
import type { RegraEncargos } from "@/lib/crediario";
import { diasAntes, restanteParcela, situacaoParcela, SITUACAO_PARCELA } from "@/lib/pagamentos";
import type { AlvoPagamentos } from "./pagamentos-actions";
import { Chip } from "@/components/ui/Chip";

export interface Conta {
  id: string;
  nome: string;
  saldo: number;
  detalhe: string | null;
}

export interface Movimentacao {
  id: string;
  data_movimentacao: string;
  descricao: string;
  origem: string | null;
  categoria: string | null;
  conta_id: string;
  conta_nome: string;
  valor: number;
  afeta_lucro: boolean;
  referencia_despesa_fixa_id: string | null;
}

export interface DespesaFixa {
  id: string;
  nome: string;
  metodo: string | null;
  valor: number;
  dia_vencimento: number;
  conta_id: string | null;
}

export interface ContaPagarReceber {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  status: "pendente" | "pago" | "recebido";
  conta_id: string | null;
  conta_nome: string | null;
  /** As três só existem quando a linha vem de uma venda (0030) — `null` pra CPR avulsa. */
  venda_id: string | null;
  venda_numero: string | null;
  total_parcelas_fiado: number | null;
  /** 0064: quanto já foi pago, quando, e de que parcela/pedido de compra é. */
  valor_pago: number;
  data_pagamento: string | null;
  parcela_numero: number | null;
  total_parcelas: number | null;
  pedido_id: string | null;
  pedido_numero: string | null;
  fornecedor_nome: string | null;
}

/** Uma linha do histórico: pagamento feito (fornecedor/conta) ou recebimento (crediário). */
export interface ItemHistorico {
  id: string;
  tipo: "pago" | "recebido";
  data: string;
  valor: number;
  descricao: string;
  quem: string | null;
  conta: string | null;
  /** A parcela ficou quitada (ou ainda resta algo dela em aberto). */
  quitado: boolean;
}

const FILTROS_PAGAR = ["Todos", "Vencidos", "Próximos 7 dias", "Pagos"] as const;
const FILTROS_RECEBER = ["Todos", "Vencidos", "Crediário", "Próximos 7 dias"] as const;
const PERIODOS_HISTORICO = [
  { id: "30", rotulo: "30 dias", dias: 30 },
  { id: "90", rotulo: "90 dias", dias: 90 },
  { id: "tudo", rotulo: "Tudo", dias: null },
] as const;
const TIPOS_HISTORICO = [
  { id: "todos", rotulo: "Tudo" },
  { id: "pago", rotulo: "Pagos" },
  { id: "recebido", rotulo: "Recebidos" },
] as const;

export function FinanceiroClient({
  contas,
  movimentacoes,
  despesasFixas,
  contasPagarReceber,
  fluxoCaixaDiario,
  despesasPorCategoria,
  resumo,
  historico,
  historicoOk,
  regraCrediario = null,
}: {
  /** Multa e juros do crediário (0065): a parcela atrasada já sugere o valor atualizado. */
  regraCrediario?: RegraEncargos | null;
  /** Pagamentos feitos e recebimentos de crediário, mais recente primeiro. */
  historico: ItemHistorico[];
  /** false = 0064 ausente (pagamentos a fornecedores ainda sem histórico). */
  historicoOk: boolean;
  contas: Conta[];
  movimentacoes: Movimentacao[];
  despesasFixas: DespesaFixa[];
  contasPagarReceber: ContaPagarReceber[];
  fluxoCaixaDiario: { dia: string; entradas: number; saidas: number }[];
  despesasPorCategoria: { categoria: string; valor: number }[];
  resumo: ResumoFinanceiro;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [filtroPagar, setFiltroPagar] = useState<(typeof FILTROS_PAGAR)[number]>("Todos");
  const [filtroReceber, setFiltroReceber] = useState<(typeof FILTROS_RECEBER)[number]>("Todos");
  const [modalMovimentacao, setModalMovimentacao] = useState(false);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [modalCpr, setModalCpr] = useState(false);
  const [modalLimpar, setModalLimpar] = useState(false);
  const [incluirFluxoNoLucro, setIncluirFluxoNoLucro] = useState(false);
  const [filtroContaId, setFiltroContaId] = useState<string | null>(null);
  const [parcelasAbertas, setParcelasAbertas] = useState<{ vendaId: string; numero: string } | null>(null);
  const [recebendo, setRecebendo] = useState<ContaParaReceber | null>(null);
  const [pagamentosAbertos, setPagamentosAbertos] = useState<{ alvo: AlvoPagamentos; titulo: string } | null>(null);
  const [periodoHistorico, setPeriodoHistorico] = useState<(typeof PERIODOS_HISTORICO)[number]["id"]>("30");
  const [tipoHistorico, setTipoHistorico] = useState<(typeof TIPOS_HISTORICO)[number]["id"]>("todos");
  const lancamentosRef = useRef<HTMLDivElement>(null);

  function verMovimentacoesDaConta(contaId: string) {
    setFiltroContaId(contaId);
    lancamentosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportarRelatorio() {
    const linhas: (string | number)[][] = [];

    linhas.push(["Resumo do Período"]);
    linhas.push(["Receita do Mês", receitaMensal.toFixed(2)]);
    linhas.push(["Despesas do Mês", despesasMensais.toFixed(2)]);
    linhas.push(["Resultado do Mês", resultadoMensal.toFixed(2)]);
    linhas.push(["Saldo Líquido Realizado", saldoLiquido.toFixed(2)]);
    linhas.push(["Saldo Atual em Contas", saldoAtual.toFixed(2)]);
    linhas.push(["Saldo Projetado (30 dias)", saldoProjetado30Dias.toFixed(2)]);
    linhas.push([]);

    linhas.push(["Lançamentos"]);
    linhas.push(["Data", "Descrição", "Categoria", "Conta", "Afeta Lucro", "Valor"]);
    for (const m of movimentacoes) {
      linhas.push([formatarDataIso(m.data_movimentacao), m.descricao, m.categoria ?? "", m.conta_nome, m.afeta_lucro ? "Sim" : "Não", m.valor.toFixed(2)]);
    }
    linhas.push([]);

    linhas.push(["Contas a Pagar & Receber Pendentes"]);
    linhas.push(["Tipo", "Descrição", "Vencimento", "Conta", "Valor"]);
    for (const c of contasPagarReceber.filter((c) => c.status === "pendente")) {
      linhas.push([c.tipo === "pagar" ? "A Pagar" : "A Receber", c.descricao, formatarDataIso(c.data_vencimento), c.conta_nome ?? "", c.valor.toFixed(2)]);
    }

    baixarArquivo(`relatorio-financeiro-${hojeIso}.csv`, matrizParaCsv(linhas));
  }

  // Vem agregado do banco (RPC resumo_financeiro). Somar `movimentacoes` aqui daria o
  // total dos 100 lançamentos que a página carrega, não o do período inteiro — um número
  // errado que continuava parecendo certo.
  const saldoLiquido = resumo.saldo_liquido;
  const custoFixoMensal = despesasFixas.reduce((a, d) => a + d.valor, 0);

  const receitaMensal = fluxoCaixaDiario.reduce((a, d) => a + d.entradas, 0);
  const despesasMensais = despesasPorCategoria.reduce((a, d) => a + d.valor, 0);
  const resultadoMensal = receitaMensal - despesasMensais;
  const margemLiquidaPct = receitaMensal > 0 ? (resultadoMensal / receitaMensal) * 100 : 0;

  const totalAPagar = contasPagarReceber.filter((c) => c.tipo === "pagar" && c.status === "pendente").reduce((a, c) => a + restanteParcela(c), 0);
  const totalAReceber = contasPagarReceber.filter((c) => c.tipo === "receber" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);

  const hoje = new Date();
  const em7Dias = new Date(hoje);
  em7Dias.setDate(em7Dias.getDate() + 7);
  const em30Dias = new Date(hoje);
  em30Dias.setDate(em30Dias.getDate() + 30);
  // `toISOString()` converteria para UTC e, depois das 21h em Brasília, já devolveria o dia
  // seguinte — jogando os vencimentos de hoje para fora de todos os filtros abaixo.
  const hojeIso = hojeIsoLocal(hoje);
  const em7DiasIso = hojeIsoLocal(em7Dias);
  const em30DiasIso = hojeIsoLocal(em30Dias);

  // Separadas de verdade — duas listas, dois filtros, cada um com as opções que fazem
  // sentido pro tipo (Fiado só existe do lado de A Receber).
  const contasPagar = contasPagarReceber.filter((c) => c.tipo === "pagar");
  const contasReceber = contasPagarReceber.filter((c) => c.tipo === "receber");

  const pagarFiltrado = contasPagar.filter((c) => {
    if (filtroPagar === "Vencidos") return c.status === "pendente" && c.data_vencimento < hojeIso;
    if (filtroPagar === "Próximos 7 dias") return c.status === "pendente" && c.data_vencimento <= em7DiasIso;
    if (filtroPagar === "Pagos") return c.status !== "pendente";
    return true;
  });

  const receberFiltrado = contasReceber.filter((c) => {
    if (filtroReceber === "Vencidos") return c.status === "pendente" && c.data_vencimento < hojeIso;
    if (filtroReceber === "Crediário") return c.venda_id !== null;
    if (filtroReceber === "Próximos 7 dias") return c.status === "pendente" && c.data_vencimento <= em7DiasIso;
    return true;
  });

  const vencimentosProximos = contasPagarReceber.filter(
    (c) => c.status === "pendente" && c.data_vencimento <= em7DiasIso,
  );

  const saldoAtual = contas.reduce((a, c) => a + c.saldo, 0);
  const pendentesEm30Dias = contasPagarReceber.filter((c) => c.status === "pendente" && c.data_vencimento <= em30DiasIso);
  const aReceberEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "receber").reduce((a, c) => a + c.valor, 0);
  const aPagarEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "pagar").reduce((a, c) => a + restanteParcela(c), 0);

  const periodoH = PERIODOS_HISTORICO.find((p) => p.id === periodoHistorico)!;
  const desdeHistorico = periodoH.dias ? diasAntes(hojeIso, periodoH.dias) : "";
  const historicoFiltrado = historico.filter((h) => h.data >= desdeHistorico && (tipoHistorico === "todos" || h.tipo === tipoHistorico));
  const totalPagoHistorico = historicoFiltrado.filter((h) => h.tipo === "pago").reduce((a, h) => a + h.valor, 0);
  const totalRecebidoHistorico = historicoFiltrado.filter((h) => h.tipo === "recebido").reduce((a, h) => a + h.valor, 0);

  function abrirPagamentos(c: ContaPagarReceber) {
    setPagamentosAbertos(
      c.pedido_id
        ? { alvo: { pedidoId: c.pedido_id }, titulo: `Pedido ${c.pedido_numero ?? ""}${c.fornecedor_nome ? ` · ${c.fornecedor_nome}` : ""}` }
        : { alvo: { contaId: c.id }, titulo: c.descricao },
    );
  }
  const saldoProjetado30Dias = saldoAtual + aReceberEm30Dias - aPagarEm30Dias;

  const vencidos = vencimentosProximos.filter((c) => c.data_vencimento < hojeIso);
  const vencendo = vencimentosProximos.filter((c) => c.data_vencimento >= hojeIso);

  const impactoNoLucro = incluirFluxoNoLucro
    ? resumo.saldo_liquido
    : resumo.entradas_com_lucro + resumo.saidas_com_lucro;

  const contaFiltrada = filtroContaId ? contas.find((c) => c.id === filtroContaId) ?? null : null;
  const movimentacoesFiltradas = filtroContaId ? movimentacoes.filter((m) => m.conta_id === filtroContaId) : movimentacoes;
  const entradasContaFiltrada = movimentacoesFiltradas.filter((m) => m.valor > 0).reduce((a, m) => a + m.valor, 0);
  const saidasContaFiltrada = movimentacoesFiltradas.filter((m) => m.valor < 0).reduce((a, m) => a + m.valor, 0);

  function adicionarMovimentacao(dados: MovimentacaoInput) {
    startTransition(async () => {
      const r = await executarComToast(criarMovimentacao(dados), { erro: "Erro ao registrar movimentação" });
      if (r.ok) {
        setModalMovimentacao(false);
        toast.success("Movimentação registrada");
      }
    });
  }

  function adicionarDespesaFixa(dados: DespesaFixaInput) {
    startTransition(async () => {
      const r = await executarComToast(criarDespesaFixa(dados), { erro: "Erro ao cadastrar despesa fixa" });
      if (r.ok) {
        setModalDespesa(false);
        toast.success("Despesa fixa cadastrada");
      }
    });
  }

  function adicionarCpr(dados: ContaPagarReceberInput) {
    startTransition(async () => {
      const r = await executarComToast(criarContaPagarReceber(dados), { erro: "Erro ao adicionar registro" });
      if (r.ok) {
        setModalCpr(false);
        toast.success("Registro adicionado");
      }
    });
  }

  async function alternarRetirada(despesa: DespesaFixa) {
    const movExistente = movimentacoes.find((m) => m.referencia_despesa_fixa_id === despesa.id);
    const ok = await confirm({
      title: movExistente ? "Desfazer retirada?" : "Retirar valor da conta?",
      message: movExistente
        ? `A retirada de "${despesa.nome}" (${formatBRL(despesa.valor)}) será desfeita e o saldo da conta ajustado de volta.`
        : `"${despesa.nome}" (${formatBRL(despesa.valor)}) será descontado agora do saldo da conta vinculada.`,
      confirmLabel: "Confirmar",
    });
    if (!ok) return;
    startTransition(async () => {
      const erro = "Erro ao atualizar despesa";
      if (movExistente) {
        await executarComToast(desfazerRetiradaDespesa(movExistente.id), { sucesso: "Retirada desfeita", erro });
      } else {
        await executarComToast(retirarDespesaDaConta(despesa.id), { sucesso: "Valor retirado da conta", erro });
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Financeiro"
        actions={
          <>
            <Button variant="secondary" onClick={() => setModalLimpar(true)}>
              Limpar Dados
            </Button>
            <Button variant="secondary" onClick={exportarRelatorio}>
              <Download size={14} /> Exportar Relatório
            </Button>
            <Button variant="secondary" onClick={() => setModalDespesa(true)}>
              Nova Despesa Fixa
            </Button>
            <Button variant="primary" onClick={() => setModalMovimentacao(true)}>
              + Nova Entrada / Saída
            </Button>
          </>
        }
      />

      {/* Os alertas moram na Vixe (estoque, margem, preço, contas e crediário). Aqui fica só
          o resumo do que é do Financeiro: o que venceu e o que vence nos próximos 7 dias. */}
      <Link
        href="/vixe"
        className={`mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-2.5 text-sm hover:bg-surface-2 ${
          vencidos.length > 0 ? "border-negative/40 bg-negative-soft" : "border-border bg-surface-1"
        }`}
      >
        {vencimentosProximos.length === 0 ? (
          <span className="inline-flex items-center gap-2 text-text-secondary">
            <ShieldCheck size={15} className="text-positive" /> Nenhuma conta vencida ou vencendo nos próximos 7 dias.
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-text-primary">
            <AlertTriangle size={15} className={vencidos.length > 0 ? "text-negative" : "text-accent"} />
            {vencidos.length > 0 && <strong className="text-negative">{vencidos.length} vencida(s)</strong>}
            {vencidos.length > 0 && vencendo.length > 0 && " · "}
            {vencendo.length > 0 && `${vencendo.length} vencendo em 7 dias`}
          </span>
        )}
        <span className="ml-auto text-accent">Ver todos os alertas na Vixe ›</span>
      </Link>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Receita do Mês</CardEyebrow>
          <HeroMetric value={formatBRL(receitaMensal)} />
        </Card>
        <Card>
          <CardEyebrow>Despesas do Mês</CardEyebrow>
          <HeroMetric value={formatBRL(despesasMensais)} />
        </Card>
        <Card>
          <CardEyebrow>
            Resultado do Mês <InfoTooltip text="Receita do mês menos despesas do mês (Fluxo de Caixa dos últimos 30 dias)." />
          </CardEyebrow>
          <HeroMetric
            value={formatBRL(resultadoMensal)}
            accent
            valorNumerico={resultadoMensal}
            caption={`Margem líquida: ${margemLiquidaPct.toFixed(1).replace(".", ",")}%`}
          />
        </Card>
        <Card>
          <CardEyebrow>
            Saldo Líquido Realizado <InfoTooltip text="Entradas menos saídas de todos os lançamentos já registrados, somados no banco." />
          </CardEyebrow>
          <HeroMetric value={formatBRL(saldoLiquido)} valorNumerico={saldoLiquido} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2">
          <h2 className="text-base font-semibold text-text-primary mb-1">Fluxo de Caixa — Últimos 30 dias</h2>
          <p className="text-xs text-text-tertiary mb-2">Entradas e saídas diárias</p>
          <CashFlowChart data={fluxoCaixaDiario} />
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-1">Saídas por Categoria</h2>
          <p className="text-xs text-text-tertiary mb-2">Mês atual</p>
          <CategoryBarChart data={despesasPorCategoria} />
        </Card>
      </div>

      <Card className="mb-5">
        <h2 className="text-base font-semibold text-text-primary mb-1">Projeção de Fluxo de Caixa</h2>
        <p className="text-xs text-text-tertiary mb-4">Saldo atual das contas somado ao que está previsto entrar/sair nos próximos 30 dias</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <div className="text-xs text-text-tertiary mb-1">Saldo Atual</div>
            <div className="font-mono text-xl text-text-primary">{formatBRL(saldoAtual)}</div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary mb-1">
              A Receber − A Pagar (30 dias) <InfoTooltip text="Soma das contas a pagar e a receber pendentes com vencimento nos próximos 30 dias." />
            </div>
            <div className="font-mono text-xl text-text-primary">
              <span className="text-positive">+{formatBRL(aReceberEm30Dias)}</span> <span className="text-negative">-{formatBRL(aPagarEm30Dias)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary mb-1">Saldo Projetado (30 dias)</div>
            <div className={`font-mono text-2xl font-semibold ${saldoProjetado30Dias >= 0 ? "text-accent" : "text-negative"}`}>
              {formatBRL(saldoProjetado30Dias)}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card padding="nenhum" className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Contas a Pagar</h2>
              <p className="text-sm text-negative">{formatBRL(totalAPagar)} pendente</p>
            </div>
            <button onClick={() => setModalCpr(true)} className="text-sm text-accent hover:underline shrink-0">
              + Novo
            </button>
          </div>
          <div className="flex gap-2 flex-wrap px-5 pb-4">
            {FILTROS_PAGAR.map((f) => (
              <Chip key={f} onClick={() => setFiltroPagar(f)} ativo={filtroPagar === f}>
                {f}
              </Chip>
            ))}
          </div>
          {pagarFiltrado.length === 0 ? (
            <EmptyState icon={Wallet} title="Nada por aqui" description="Nenhuma conta a pagar encontrada para esse filtro." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Descrição</Th>
                  <Th>Conta</Th>
                  <Th align="right">Valor</Th>
                  <Th>Vencimento</Th>
                  <Th>Status</Th>
                  <Th align="right"></Th>
                </tr>
              </Thead>
              <tbody>
                {pagarFiltrado.map((c) => {
                  const sit = situacaoParcela(c, hojeIso);
                  return (
                    <Tr key={c.id}>
                      <Td>
                        <button type="button" onClick={() => abrirPagamentos(c)} className="text-left hover:underline">
                          {c.descricao}
                        </button>
                        {c.fornecedor_nome && <div className="text-xs text-text-tertiary">{c.fornecedor_nome}</div>}
                      </Td>
                      <Td className="text-text-secondary">{c.conta_nome ?? "—"}</Td>
                      <Td align="right" mono className="text-negative">
                        {formatBRL(c.status === "pendente" ? restanteParcela(c) : c.valor_pago || c.valor)}
                        {c.status === "pendente" && c.valor_pago > 0 && <div className="text-[11px] text-text-tertiary">de {formatBRL(c.valor)}</div>}
                      </Td>
                      <Td mono>
                        {formatarDataIso(c.data_vencimento)}
                        {c.status !== "pendente" && c.data_pagamento && <div className="text-[11px] text-text-tertiary">pago {formatarDataIso(c.data_pagamento)}</div>}
                      </Td>
                      <Td>
                        <StatusChip label={SITUACAO_PARCELA[sit].rotulo} tone={SITUACAO_PARCELA[sit].tom} />
                      </Td>
                      <Td align="right">
                        <RowMenu
                          actions={[
                            ...(c.status === "pendente" ? [{ label: "Registrar pagamento", onClick: () => abrirPagamentos(c) }] : []),
                            { label: c.pedido_id ? "Histórico do pedido" : "Histórico de pagamentos", onClick: () => abrirPagamentos(c) },
                          ]}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card padding="nenhum" className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Contas a Receber</h2>
              <p className="text-sm text-positive">{formatBRL(totalAReceber)} pendente</p>
            </div>
            <button onClick={() => setModalCpr(true)} className="text-sm text-accent hover:underline shrink-0">
              + Novo
            </button>
          </div>
          <div className="flex gap-2 flex-wrap px-5 pb-4">
            {FILTROS_RECEBER.map((f) => (
              <Chip key={f} onClick={() => setFiltroReceber(f)} ativo={filtroReceber === f}>
                {f}
              </Chip>
            ))}
          </div>
          {receberFiltrado.length === 0 ? (
            <EmptyState icon={Wallet} title="Nada por aqui" description="Nenhuma conta a receber encontrada para esse filtro." />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Descrição</Th>
                  <Th>Conta</Th>
                  <Th align="right">Valor</Th>
                  <Th>Vencimento</Th>
                  <Th>Status</Th>
                  <Th align="right"></Th>
                </tr>
              </Thead>
              <tbody>
                {receberFiltrado.map((c) => {
                  // Fiado parcelado (0030): a "verdade" está nas parcelas, não num clique
                  // único — o status do registro "pai" muda sozinho quando a última é paga.
                  const parcelado = c.venda_id !== null && (c.total_parcelas_fiado ?? 1) > 1;
                  return (
                    <Tr key={c.id}>
                      <Td>{c.descricao}</Td>
                      <Td className="text-text-secondary">{c.conta_nome ?? "—"}</Td>
                      <Td align="right" mono className="text-positive">
                        {formatBRL(c.valor)}
                      </Td>
                      <Td mono>{formatarDataIso(c.data_vencimento)}</Td>
                      <Td>
                        <StatusChip label={c.status === "pendente" ? "Pendente" : "Recebido"} tone={c.status === "pendente" ? "neutral" : "positive"} />
                      </Td>
                      <Td align="right">
                        {parcelado ? (
                          <RowMenu
                            actions={[
                              {
                                label: "Visualizar parcelas",
                                onClick: () => setParcelasAbertas({ vendaId: c.venda_id!, numero: c.venda_numero ?? "" }),
                              },
                            ]}
                          />
                        ) : (
                          c.status === "pendente" && (
                            <RowMenu
                              actions={[
                                {
                                  label: "Receber",
                                  onClick: () =>
                                    setRecebendo({ id: c.id, descricao: c.descricao, valor: c.valor, valor_pago: c.valor_pago, data_vencimento: c.data_vencimento, conta_id: c.conta_id, crediario: c.venda_id !== null }),
                                },
                              ]}
                            />
                          )
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card padding="nenhum" className="overflow-hidden mb-5">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Histórico de pagamentos</h2>
            <p className="text-sm text-text-secondary">
              Pago <span className="font-mono text-negative">{formatBRL(totalPagoHistorico)}</span> · Recebido <span className="font-mono text-positive">{formatBRL(totalRecebidoHistorico)}</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {TIPOS_HISTORICO.map((t) => (
              <Chip key={t.id} onClick={() => setTipoHistorico(t.id)} ativo={tipoHistorico === t.id}>
                {t.rotulo}
              </Chip>
            ))}
            <span className="w-px bg-border mx-1" aria-hidden />
            {PERIODOS_HISTORICO.map((p) => (
              <Chip key={p.id} onClick={() => setPeriodoHistorico(p.id)} ativo={periodoHistorico === p.id}>
                {p.rotulo}
              </Chip>
            ))}
          </div>
        </div>
        {!historicoOk && <p className="px-5 pb-3 text-xs text-negative">Os pagamentos a fornecedores entram aqui depois da migração 0064.</p>}
        {historicoFiltrado.length === 0 ? (
          <EmptyState icon={History} title="Nenhum pagamento no período" description="Cada parcela paga a fornecedor ou recebida no crediário aparece aqui, com data e valor." />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <Thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th>Conta</Th>
                  <Th align="right">Valor</Th>
                  <Th>Situação</Th>
                </tr>
              </Thead>
              <tbody>
                {historicoFiltrado.map((h) => (
                  <Tr key={h.id}>
                    <Td mono>{formatarDataIso(h.data)}</Td>
                    <Td>
                      <div>{h.descricao}</div>
                      {h.quem && <div className="text-xs text-text-tertiary">{h.quem}</div>}
                    </Td>
                    <Td className="text-text-secondary">{h.conta ?? "—"}</Td>
                    <Td align="right" mono className={h.tipo === "pago" ? "text-negative" : "text-positive"}>
                      {h.tipo === "pago" ? "−" : "+"}
                      {formatBRL(h.valor)}
                    </Td>
                    <Td>
                      <StatusChip label={h.quitado ? "Quitado" : "Pago em parte"} tone={h.quitado ? "positive" : "neutral"} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card ref={lancamentosRef} padding="nenhum" className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-text-primary">Lançamentos Recentes</h2>
              {contaFiltrada && (
                <button
                  onClick={() => setFiltroContaId(null)}
                  className="text-xs bg-accent-soft text-accent rounded-full px-2.5 py-1 flex items-center gap-1 hover:opacity-80"
                >
                  {contaFiltrada.nome} ×
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-text-secondary flex items-center gap-1">
                Incluir fluxo financeiro no lucro
                <InfoTooltip text="Quando ligado, compras de estoque e outros ajustes de caixa contam como impacto direto no lucro. Quando desligado, só entram no lucro os lançamentos marcados como 'afeta o lucro'." />
              </span>
              <input
                type="checkbox"
                checked={incluirFluxoNoLucro}
                onChange={(e) => setIncluirFluxoNoLucro(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
            </label>
          </div>
          {contaFiltrada && (
            <div className="flex items-center gap-4 px-5 pb-4 text-xs text-text-secondary">
              <span>Entradas: <span className="font-mono text-positive">{formatBRL(entradasContaFiltrada)}</span></span>
              <span>Saídas: <span className="font-mono text-negative">{formatBRL(Math.abs(saidasContaFiltrada))}</span></span>
              <span>
                Saldo dos lançamentos listados:{" "}
                <span className={`font-mono ${classeValor(entradasContaFiltrada + saidasContaFiltrada)}`}>
                  {formatBRL(entradasContaFiltrada + saidasContaFiltrada)}
                </span>
              </span>
            </div>
          )}
          {movimentacoesFiltradas.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhum lançamento ainda"
              description={contaFiltrada ? "Nenhuma movimentação encontrada para esta conta." : "Registre entradas e saídas para acompanhar o fluxo de caixa."}
            />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição / Origem</Th>
                  <Th>Categoria</Th>
                  <Th>Conta</Th>
                  <Th>Afeta Lucro</Th>
                  <Th align="right">Valor</Th>
                </tr>
              </Thead>
              <tbody>
                {movimentacoesFiltradas.map((m) => (
                  <Tr key={m.id}>
                    <Td mono>{formatarDataIso(m.data_movimentacao)}</Td>
                    <Td>
                      <div>{m.descricao}</div>
                      <div className="text-xs text-text-tertiary">{m.origem}</div>
                    </Td>
                    <Td>{m.categoria}</Td>
                    <Td>{m.conta_nome}</Td>
                    <Td>
                      <StatusChip label={m.afeta_lucro ? "Sim" : "Só caixa"} tone={m.afeta_lucro ? "positive" : "neutral"} />
                    </Td>
                    <Td align="right" mono className={m.valor >= 0 ? "text-positive" : "text-negative"}>
                      {m.valor >= 0 ? "+" : "-"} {formatBRL(Math.abs(m.valor))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-sm text-text-secondary flex items-center gap-1">
              Impacto no lucro (lançamentos acima)
              <InfoTooltip text="Soma apenas dos lançamentos considerados no lucro, conforme o toggle acima." />
            </span>
            <span className={`font-mono font-medium ${impactoNoLucro >= 0 ? "text-positive" : "text-negative"}`}>
              {formatBRL(impactoNoLucro)}
            </span>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-1">Saldos em Conta</h2>
          <p className="text-xs text-text-tertiary mb-4">Tempo real</p>
          <div className="space-y-4">
            {contas.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-text-primary">{c.nome}</div>
                  <div className="text-xs text-text-tertiary">{c.detalhe}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-text-primary">{formatBRL(c.saldo)}</div>
                  <button onClick={() => verMovimentacoesDaConta(c.id)} className="text-xs text-accent hover:underline">
                    Ver mais
                  </button>
                </div>
              </div>
            ))}
            {contas.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma conta cadastrada ainda.</p>}
          </div>
        </Card>
      </div>

      <Card padding="nenhum" className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-text-primary">Despesas Fixas Recorrentes</h2>
          <div className="text-sm text-text-secondary">
            Custo mensal: <span className="font-mono text-text-primary">{formatBRL(custoFixoMensal)}</span>
          </div>
        </div>
        {despesasFixas.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma despesa fixa cadastrada" description="Cadastre aluguel, internet e outras contas recorrentes." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Identificador</Th>
                <Th>Método de Cobrança</Th>
                <Th align="right">Custo Mensal</Th>
                <Th align="right">Dia Cobrança</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {despesasFixas.map((d) => {
                const retirado = movimentacoes.some((m) => m.referencia_despesa_fixa_id === d.id);
                return (
                  <Tr key={d.id}>
                    <Td>{d.nome}</Td>
                    <Td>{d.metodo}</Td>
                    <Td align="right" mono>
                      {formatBRL(d.valor)}
                    </Td>
                    <Td align="right" mono>
                      Dia {d.dia_vencimento}
                    </Td>
                    <Td>
                      <StatusChip label={retirado ? "Retirado" : "Não retirado"} tone={retirado ? "positive" : "neutral"} />
                    </Td>
                    <Td align="right">
                      <RowMenu
                        actions={[
                          { label: retirado ? "Desfazer retirada" : "Retirar da conta", onClick: () => alternarRetirada(d) },
                        ]}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/*
        O `key` amarrado ao estado de abertura zera o formulário ao REABRIR, em vez de
        limpá-lo no clique em salvar. Antes o campo era esvaziado antes de saber se o
        servidor aceitou: quando falhava, o modal continuava aberto e vazio e o usuário
        perdia tudo que tinha digitado.
      */}
      <NovaMovimentacaoModal key={`mov-${modalMovimentacao}`} open={modalMovimentacao} onClose={() => setModalMovimentacao(false)} contas={contas} onSave={adicionarMovimentacao} salvando={pending} />
      <NovaDespesaFixaModal key={`desp-${modalDespesa}`} open={modalDespesa} onClose={() => setModalDespesa(false)} contas={contas} onSave={adicionarDespesaFixa} salvando={pending} />
      <NovaCprModal key={`cpr-${modalCpr}`} open={modalCpr} onClose={() => setModalCpr(false)} contas={contas} onSave={adicionarCpr} salvando={pending} />
      <LimparDadosModal open={modalLimpar} onClose={() => setModalLimpar(false)} confirm={confirm} />
      <ParcelasVendaModal
        key={`parcelas-${parcelasAbertas?.vendaId ?? "fechado"}`}
        vendaId={parcelasAbertas?.vendaId ?? null}
        vendaNumero={parcelasAbertas?.numero ?? null}
        contas={contas}
        regra={regraCrediario}
        onClose={() => setParcelasAbertas(null)}
      />
      <ReceberContaModal key={`receber-${recebendo?.id ?? "fechado"}`} conta={recebendo} contas={contas} regra={regraCrediario} onClose={() => setRecebendo(null)} />
      <HistoricoPagamentosModal aberto={pagamentosAbertos} contas={contas} onClose={() => setPagamentosAbertos(null)} />
      {ConfirmDialog}
    </>
  );
}
