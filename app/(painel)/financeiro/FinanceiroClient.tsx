"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Wallet, Receipt, AlertTriangle, TrendingDown, PackageX, ShieldCheck, Download } from "lucide-react";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { formatBRL } from "@/lib/mock-data";
import type { AlertaErosaoMargem, AlertaRupturaEstoque } from "@/lib/alertas";
import {
  criarMovimentacao,
  criarDespesaFixa,
  retirarDespesaDaConta,
  desfazerRetiradaDespesa,
  quitarContaPagarReceber,
  criarContaPagarReceber,
  avaliarLimpezaFinanceiro,
  limparDadosFinanceiros,
  type MovimentacaoInput,
  type DespesaFixaInput,
  type ContaPagarReceberInput,
  type EscopoLimpeza,
  type ImpactoLimpeza,
} from "./actions";

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
}

const FILTROS_CPR = ["Todos", "A Pagar", "A Receber", "Vencidos"] as const;

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function FinanceiroClient({
  contas,
  movimentacoes,
  despesasFixas,
  contasPagarReceber,
  fluxoCaixaDiario,
  despesasPorCategoria,
  alertasErosaoMargem,
  alertasRupturaEstoque,
}: {
  contas: Conta[];
  movimentacoes: Movimentacao[];
  despesasFixas: DespesaFixa[];
  contasPagarReceber: ContaPagarReceber[];
  fluxoCaixaDiario: { dia: string; entradas: number; saidas: number }[];
  despesasPorCategoria: { categoria: string; valor: number }[];
  alertasErosaoMargem: AlertaErosaoMargem[];
  alertasRupturaEstoque: AlertaRupturaEstoque[];
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [filtroCpr, setFiltroCpr] = useState<(typeof FILTROS_CPR)[number]>("Todos");
  const [modalMovimentacao, setModalMovimentacao] = useState(false);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [modalCpr, setModalCpr] = useState(false);
  const [modalLimpar, setModalLimpar] = useState(false);
  const [incluirFluxoNoLucro, setIncluirFluxoNoLucro] = useState(false);
  const [filtroContaId, setFiltroContaId] = useState<string | null>(null);
  const lancamentosRef = useRef<HTMLDivElement>(null);

  function verMovimentacoesDaConta(contaId: string) {
    setFiltroContaId(contaId);
    lancamentosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportarRelatorio() {
    const paraCsv = (v: string | number) => {
      const t = String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const linha = (campos: (string | number)[]) => campos.map(paraCsv).join(",");
    const linhas: string[] = [];

    linhas.push(linha(["Resumo do Período"]));
    linhas.push(linha(["Receita do Mês", receitaMensal.toFixed(2)]));
    linhas.push(linha(["Despesas do Mês", despesasMensais.toFixed(2)]));
    linhas.push(linha(["Resultado do Mês", resultadoMensal.toFixed(2)]));
    linhas.push(linha(["Saldo Líquido Realizado", saldoLiquido.toFixed(2)]));
    linhas.push(linha(["Saldo Atual em Contas", saldoAtual.toFixed(2)]));
    linhas.push(linha(["Saldo Projetado (30 dias)", saldoProjetado30Dias.toFixed(2)]));
    linhas.push("");

    linhas.push(linha(["Lançamentos"]));
    linhas.push(linha(["Data", "Descrição", "Categoria", "Conta", "Afeta Lucro", "Valor"]));
    for (const m of movimentacoes) {
      linhas.push(linha([formatarData(m.data_movimentacao), m.descricao, m.categoria ?? "", m.conta_nome, m.afeta_lucro ? "Sim" : "Não", m.valor.toFixed(2)]));
    }
    linhas.push("");

    linhas.push(linha(["Contas a Pagar & Receber Pendentes"]));
    linhas.push(linha(["Tipo", "Descrição", "Vencimento", "Conta", "Valor"]));
    for (const c of contasPagarReceber.filter((c) => c.status === "pendente")) {
      linhas.push(linha([c.tipo === "pagar" ? "A Pagar" : "A Receber", c.descricao, formatarData(c.data_vencimento), c.conta_nome ?? "", c.valor.toFixed(2)]));
    }

    const csv = linhas.join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${hojeIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalEntradas = movimentacoes.filter((m) => m.valor > 0).reduce((a, m) => a + m.valor, 0);
  const totalSaidas = movimentacoes.filter((m) => m.valor < 0).reduce((a, m) => a + m.valor, 0);
  const saldoLiquido = totalEntradas + totalSaidas;
  const custoFixoMensal = despesasFixas.reduce((a, d) => a + d.valor, 0);

  const receitaMensal = fluxoCaixaDiario.reduce((a, d) => a + d.entradas, 0);
  const despesasMensais = despesasPorCategoria.reduce((a, d) => a + d.valor, 0);
  const resultadoMensal = receitaMensal - despesasMensais;
  const margemLiquidaPct = receitaMensal > 0 ? (resultadoMensal / receitaMensal) * 100 : 0;

  const cprFiltrado = contasPagarReceber.filter((c) => {
    if (filtroCpr === "A Pagar") return c.tipo === "pagar";
    if (filtroCpr === "A Receber") return c.tipo === "receber";
    if (filtroCpr === "Vencidos") return c.status === "pendente";
    return true;
  });

  const totalAPagar = contasPagarReceber.filter((c) => c.tipo === "pagar" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);
  const totalAReceber = contasPagarReceber.filter((c) => c.tipo === "receber" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);

  const hoje = new Date();
  const em7Dias = new Date(hoje);
  em7Dias.setDate(em7Dias.getDate() + 7);
  const em30Dias = new Date(hoje);
  em30Dias.setDate(em30Dias.getDate() + 30);
  const hojeIso = hoje.toISOString().slice(0, 10);
  const em7DiasIso = em7Dias.toISOString().slice(0, 10);
  const em30DiasIso = em30Dias.toISOString().slice(0, 10);

  const vencimentosProximos = contasPagarReceber.filter(
    (c) => c.status === "pendente" && (c.data_vencimento <= hojeIso || c.data_vencimento <= em7DiasIso),
  );

  const saldoAtual = contas.reduce((a, c) => a + c.saldo, 0);
  const pendentesEm30Dias = contasPagarReceber.filter((c) => c.status === "pendente" && c.data_vencimento <= em30DiasIso);
  const aReceberEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "receber").reduce((a, c) => a + c.valor, 0);
  const aPagarEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "pagar").reduce((a, c) => a + c.valor, 0);
  const saldoProjetado30Dias = saldoAtual + aReceberEm30Dias - aPagarEm30Dias;

  const totalAlertas = vencimentosProximos.length + alertasErosaoMargem.length + alertasRupturaEstoque.length;

  const lancamentosConsiderados = incluirFluxoNoLucro ? movimentacoes : movimentacoes.filter((m) => m.afeta_lucro);
  const impactoNoLucro = lancamentosConsiderados.reduce((a, m) => a + m.valor, 0);

  const contaFiltrada = filtroContaId ? contas.find((c) => c.id === filtroContaId) ?? null : null;
  const movimentacoesFiltradas = filtroContaId ? movimentacoes.filter((m) => m.conta_id === filtroContaId) : movimentacoes;
  const entradasContaFiltrada = movimentacoesFiltradas.filter((m) => m.valor > 0).reduce((a, m) => a + m.valor, 0);
  const saidasContaFiltrada = movimentacoesFiltradas.filter((m) => m.valor < 0).reduce((a, m) => a + m.valor, 0);

  async function quitar(c: ContaPagarReceber) {
    const ok = await confirm({
      title: c.tipo === "pagar" ? "Marcar como pago?" : "Marcar como recebido?",
      message: `"${c.descricao}" (${formatBRL(c.valor)}) terá o saldo da conta atualizado imediatamente.`,
      confirmLabel: "Confirmar",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await quitarContaPagarReceber(c.id);
        toast.success("Status atualizado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar status");
      }
    });
  }

  function adicionarMovimentacao(dados: MovimentacaoInput) {
    startTransition(async () => {
      try {
        await criarMovimentacao(dados);
        setModalMovimentacao(false);
        toast.success("Movimentação registrada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao registrar movimentação");
      }
    });
  }

  function adicionarDespesaFixa(dados: DespesaFixaInput) {
    startTransition(async () => {
      try {
        await criarDespesaFixa(dados);
        setModalDespesa(false);
        toast.success("Despesa fixa cadastrada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao cadastrar despesa fixa");
      }
    });
  }

  function adicionarCpr(dados: ContaPagarReceberInput) {
    startTransition(async () => {
      try {
        await criarContaPagarReceber(dados);
        setModalCpr(false);
        toast.success("Registro adicionado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao adicionar registro");
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
      try {
        if (movExistente) {
          await desfazerRetiradaDespesa(movExistente.id);
          toast("Retirada desfeita");
        } else {
          await retirarDespesaDaConta(despesa.id);
          toast.success("Valor retirado da conta");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar despesa");
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

      <Card className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-text-primary">Central de Alertas</h2>
          {totalAlertas > 0 && <StatusChip label={String(totalAlertas)} tone="negative" />}
        </div>
        {totalAlertas === 0 ? (
          <EmptyState icon={ShieldCheck} title="Tudo em dia" description="Nenhum vencimento próximo, erosão de margem ou risco de ruptura de estoque no momento." />
        ) : (
          <div className="space-y-2">
            {vencimentosProximos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className={c.data_vencimento <= hojeIso ? "text-negative" : "text-accent"} />
                  <span className="text-text-primary">{c.descricao}</span>
                  <span className="text-xs text-text-tertiary">
                    {c.tipo === "pagar" ? "a pagar" : "a receber"} em {formatarData(c.data_vencimento)}
                  </span>
                </div>
                <span className="font-mono text-text-secondary">{formatBRL(c.valor)}</span>
              </div>
            ))}
            {alertasErosaoMargem.map((a) => (
              <Link
                key={a.produtoId}
                href="/produtos"
                className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2 hover:bg-surface-2/50"
              >
                <div className="flex items-center gap-2">
                  <TrendingDown size={14} className="text-negative" />
                  <span className="text-text-primary">{a.produtoNome}</span>
                  <span className="text-xs text-text-tertiary">
                    custo subiu {a.aumentoPct.toFixed(0)}% ({formatBRL(a.custoPrecificado)} → {formatBRL(a.custoRecente)})
                  </span>
                </div>
              </Link>
            ))}
            {alertasRupturaEstoque.map((a) => (
              <Link
                key={a.produtoId}
                href="/estoque"
                className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2 hover:bg-surface-2/50"
              >
                <div className="flex items-center gap-2">
                  <PackageX size={14} className="text-negative" />
                  <span className="text-text-primary">{a.produtoNome}</span>
                  <span className="text-xs text-text-tertiary">
                    estoque acaba em ~{Math.max(0, Math.round(a.diasRestantes))} dias ({a.estoqueAtual} un.)
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

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
          <HeroMetric value={formatBRL(resultadoMensal)} accent caption={`Margem líquida: ${margemLiquidaPct.toFixed(1)}%`} />
        </Card>
        <Card>
          <CardEyebrow>
            Saldo Líquido Realizado <InfoTooltip text="Entradas menos saídas dos lançamentos listados abaixo em 'Lançamentos Recentes'." />
          </CardEyebrow>
          <HeroMetric value={formatBRL(saldoLiquido)} />
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

      <Card className="p-0 overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Contas a Pagar & Receber</h2>
            <p className="text-sm text-text-secondary">
              <span className="text-negative">{formatBRL(totalAPagar)} a pagar</span> ·{" "}
              <span className="text-positive">{formatBRL(totalAReceber)} a receber</span>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {FILTROS_CPR.map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroCpr(f)}
                  className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                    filtroCpr === f
                      ? "bg-accent-soft border-accent-soft text-accent font-medium"
                      : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setModalCpr(true)} className="text-sm text-accent hover:underline shrink-0">
              + Novo
            </button>
          </div>
        </div>
        {cprFiltrado.length === 0 ? (
          <EmptyState icon={Wallet} title="Nada por aqui" description="Nenhum lançamento encontrado para esse filtro." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Tipo</Th>
                <Th>Conta</Th>
                <Th align="right">Valor</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {cprFiltrado.map((c) => (
                <Tr key={c.id}>
                  <Td>{c.descricao}</Td>
                  <Td>
                    <StatusChip label={c.tipo === "pagar" ? "A Pagar" : "A Receber"} tone={c.tipo === "pagar" ? "negative" : "positive"} />
                  </Td>
                  <Td className="text-text-secondary">{c.conta_nome ?? "—"}</Td>
                  <Td align="right" mono className={c.tipo === "pagar" ? "text-negative" : "text-positive"}>
                    {formatBRL(c.valor)}
                  </Td>
                  <Td mono>{formatarData(c.data_vencimento)}</Td>
                  <Td>
                    <StatusChip
                      label={c.status === "pendente" ? "Pendente" : c.status === "pago" ? "Pago" : "Recebido"}
                      tone={c.status === "pendente" ? "neutral" : "positive"}
                    />
                  </Td>
                  <Td align="right">
                    {c.status === "pendente" && (
                      <RowMenu
                        actions={[
                          { label: c.tipo === "pagar" ? "Marcar pago" : "Marcar recebido", onClick: () => quitar(c) },
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card ref={lancamentosRef} className="lg:col-span-2 p-0 overflow-hidden">
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
              <span>Saldo do período: <span className="font-mono text-text-primary">{formatBRL(entradasContaFiltrada + saidasContaFiltrada)}</span></span>
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
                  <Th>Vencimento</Th>
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
                    <Td mono>{formatarData(m.data_movimentacao)}</Td>
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

      <Card className="p-0 overflow-hidden">
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

      <NovaMovimentacaoModal open={modalMovimentacao} onClose={() => setModalMovimentacao(false)} contas={contas} onSave={adicionarMovimentacao} salvando={pending} />
      <NovaDespesaFixaModal open={modalDespesa} onClose={() => setModalDespesa(false)} contas={contas} onSave={adicionarDespesaFixa} salvando={pending} />
      <NovaCprModal open={modalCpr} onClose={() => setModalCpr(false)} contas={contas} onSave={adicionarCpr} salvando={pending} />
      <LimparDadosModal open={modalLimpar} onClose={() => setModalLimpar(false)} confirm={confirm} />
      {ConfirmDialog}
    </>
  );
}

function LimparDadosModal({
  open,
  onClose,
  confirm,
}: {
  open: boolean;
  onClose: () => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes);
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));
  const [escopo, setEscopo] = useState<EscopoLimpeza>({ lancamentos: true, contasPagarReceber: false });
  const [impacto, setImpacto] = useState<ImpactoLimpeza | null>(null);
  const [avaliando, setAvaliando] = useState(false);

  function fechar() {
    setImpacto(null);
    onClose();
  }

  function limparImpacto() {
    setImpacto(null);
  }

  async function avaliar() {
    setAvaliando(true);
    try {
      const resultado = await avaliarLimpezaFinanceiro(dataInicio, dataFim, escopo);
      setImpacto(resultado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao avaliar impacto");
    } finally {
      setAvaliando(false);
    }
  }

  async function executar() {
    if (!impacto) return;
    const total = impacto.lancamentos + impacto.contasPagarReceber;
    if (total === 0) {
      toast("Nenhum registro encontrado nesse período");
      return;
    }
    let mensagem = `${total} registro(s) serão apagados definitivamente para o período selecionado.`;
    if (impacto.contasVinculadasCompra > 0) {
      mensagem += ` ${impacto.contasVinculadasCompra} título(s) vêm de pedidos de compra — apagar mesmo assim?`;
    }
    const ok = await confirm({ title: "Apagar dados do Financeiro?", message: mensagem, confirmLabel: "Apagar" });
    if (!ok) return;
    startTransition(async () => {
      try {
        await limparDadosFinanceiros(dataInicio, dataFim, escopo);
        toast.success("Dados removidos");
        fechar();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao limpar dados");
      }
    });
  }

  return (
    <Modal open={open} onClose={fechar} title="Limpar Dados do Financeiro">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="De">
          <input
            type="date"
            className={inputClass}
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              limparImpacto();
            }}
          />
        </FormField>
        <FormField label="Até">
          <input
            type="date"
            className={inputClass}
            value={dataFim}
            onChange={(e) => {
              setDataFim(e.target.value);
              limparImpacto();
            }}
          />
        </FormField>
      </div>
      <div className="space-y-1 mb-4">
        {(
          [
            { key: "lancamentos", label: "Lançamentos (entradas/saídas)" },
            { key: "contasPagarReceber", label: "Contas a Pagar / Receber" },
          ] as const
        ).map((item) => (
          <label key={item.key} className="flex items-center gap-2 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={escopo[item.key]}
              onChange={(e) => {
                setEscopo((prev) => ({ ...prev, [item.key]: e.target.checked }));
                limparImpacto();
              }}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text-primary">{item.label}</span>
          </label>
        ))}
      </div>

      {impacto && (
        <div className="bg-surface-2 border border-border rounded-md p-3 mb-4 text-sm space-y-1">
          <div className="text-text-secondary">Serão apagados:</div>
          {escopo.lancamentos && <div className="text-text-primary">{impacto.lancamentos} lançamento(s)</div>}
          {escopo.contasPagarReceber && (
            <div className="text-text-primary">{impacto.contasPagarReceber} conta(s) a pagar/receber</div>
          )}
          {impacto.contasVinculadasCompra > 0 && (
            <div className="text-negative">{impacto.contasVinculadasCompra} vêm de pedidos de compra</div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={fechar}>
          Cancelar
        </Button>
        {!impacto ? (
          <Button variant="secondary" className="flex-1" onClick={avaliar} disabled={avaliando}>
            {avaliando ? "Avaliando…" : "Avaliar Impacto"}
          </Button>
        ) : (
          <Button variant="destructive" className="flex-1" onClick={executar} loading={pending}>
            Apagar
          </Button>
        )}
      </div>
    </Modal>
  );
}

function NovaMovimentacaoModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: MovimentacaoInput) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [valor, setValor] = useState(0);
  const [afetaLucro, setAfetaLucro] = useState(true);

  function salvar() {
    if (!descricao.trim() || valor <= 0 || !contaId) return;
    onSave({
      tipo,
      valor,
      descricao,
      origem: "Lançamento manual",
      categoria: categoria || "Outros",
      conta_id: contaId,
      afeta_lucro: afetaLucro,
      data_movimentacao: new Date().toISOString().slice(0, 10),
    });
    setDescricao("");
    setCategoria("");
    setValor(0);
    setAfetaLucro(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Entrada / Saída">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTipo("entrada")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "entrada" ? "bg-positive-soft border-positive/30 text-positive font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          Entrada
        </button>
        <button
          onClick={() => setTipo("saida")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "saida" ? "bg-negative-soft border-negative/30 text-negative font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          Saída
        </button>
      </div>
      <FormField label="Descrição">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <FormField label="Categoria">
        <input className={inputClass} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Matéria-prima, Receita vendas…" />
      </FormField>
      <FormField label="Conta">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Valor (R$)">
        <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
      </FormField>
      <label className="flex items-center gap-2 mb-1 cursor-pointer">
        <input type="checkbox" checked={afetaLucro} onChange={(e) => setAfetaLucro(e.target.checked)} className="w-4 h-4 accent-accent" />
        <span className="text-sm text-text-secondary">Afeta o lucro (desmarque para compras de estoque, por ex.)</span>
      </label>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function NovaDespesaFixaModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: DespesaFixaInput) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState("");
  const [metodo, setMetodo] = useState("");
  const [valor, setValor] = useState(0);
  const [dia, setDia] = useState(5);
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");

  function salvar() {
    if (!nome.trim() || valor <= 0) return;
    onSave({ nome, metodo: metodo || null, valor, dia_vencimento: dia, conta_id: contaId || null });
    setNome("");
    setMetodo("");
    setValor(0);
    setDia(5);
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Despesa Fixa">
      <FormField label="Identificador">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Aluguel, Internet…" />
      </FormField>
      <FormField label="Método de Cobrança">
        <input className={inputClass} value={metodo} onChange={(e) => setMetodo(e.target.value)} placeholder="Ex: Boleto manual" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Valor Mensal (R$)">
          <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Dia de Cobrança">
          <input
            type="number"
            min={1}
            max={31}
            className={inputClass}
            value={dia}
            onChange={(e) => setDia(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
          />
        </FormField>
      </div>
      <FormField label="Conta Vinculada">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function NovaCprModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: ContaPagarReceberInput) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [vencimento, setVencimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");

  function salvar() {
    if (!descricao.trim() || valor <= 0) return;
    onSave({ tipo, descricao, valor, data_vencimento: vencimento, conta_id: contaId || null });
    setDescricao("");
    setValor(0);
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Conta a Pagar/Receber">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTipo("pagar")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "pagar" ? "bg-negative-soft border-negative/30 text-negative font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          A Pagar
        </button>
        <button
          onClick={() => setTipo("receber")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "receber" ? "bg-positive-soft border-positive/30 text-positive font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          A Receber
        </button>
      </div>
      <FormField label="Descrição">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Valor (R$)">
          <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Vencimento">
          <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Conta">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
