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
import { Wallet, Receipt, AlertTriangle, TrendingDown, PackageX, ShieldCheck, Download } from "lucide-react";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { formatBRL, formatarDataIso, hojeIsoLocal, classeValor } from "@/lib/format";
import { matrizParaCsv, baixarArquivo } from "@/lib/csv";
import type { AlertaErosaoMargem, AlertaRupturaEstoque } from "@/lib/alertas";
import type { ResumoFinanceiro } from "./page";
import {
  criarMovimentacao,
  criarDespesaFixa,
  retirarDespesaDaConta,
  desfazerRetiradaDespesa,
  quitarContaPagarReceber,
  criarContaPagarReceber,
  type MovimentacaoInput,
  type DespesaFixaInput,
  type ContaPagarReceberInput,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { LimparDadosModal } from "@/components/financeiro/LimparDadosModal";
import { NovaMovimentacaoModal, NovaDespesaFixaModal, NovaCprModal } from "@/components/financeiro/ModaisFinanceiro";

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

export function FinanceiroClient({
  contas,
  movimentacoes,
  despesasFixas,
  contasPagarReceber,
  fluxoCaixaDiario,
  despesasPorCategoria,
  alertasErosaoMargem,
  alertasRupturaEstoque,
  resumo,
}: {
  contas: Conta[];
  movimentacoes: Movimentacao[];
  despesasFixas: DespesaFixa[];
  contasPagarReceber: ContaPagarReceber[];
  fluxoCaixaDiario: { dia: string; entradas: number; saidas: number }[];
  despesasPorCategoria: { categoria: string; valor: number }[];
  alertasErosaoMargem: AlertaErosaoMargem[];
  alertasRupturaEstoque: AlertaRupturaEstoque[];
  resumo: ResumoFinanceiro;
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

  const cprFiltrado = contasPagarReceber.filter((c) => {
    if (filtroCpr === "A Pagar") return c.tipo === "pagar";
    if (filtroCpr === "A Receber") return c.tipo === "receber";
    // Vencido é pendente E com vencimento no passado; antes devolvia todos os pendentes,
    // inclusive os que vencem daqui a meses.
    if (filtroCpr === "Vencidos") return c.status === "pendente" && c.data_vencimento < hojeIsoLocal();
    return true;
  });

  const totalAPagar = contasPagarReceber.filter((c) => c.tipo === "pagar" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);
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

  const vencimentosProximos = contasPagarReceber.filter(
    (c) => c.status === "pendente" && c.data_vencimento <= em7DiasIso,
  );

  const saldoAtual = contas.reduce((a, c) => a + c.saldo, 0);
  const pendentesEm30Dias = contasPagarReceber.filter((c) => c.status === "pendente" && c.data_vencimento <= em30DiasIso);
  const aReceberEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "receber").reduce((a, c) => a + c.valor, 0);
  const aPagarEm30Dias = pendentesEm30Dias.filter((c) => c.tipo === "pagar").reduce((a, c) => a + c.valor, 0);
  const saldoProjetado30Dias = saldoAtual + aReceberEm30Dias - aPagarEm30Dias;

  const totalAlertas = vencimentosProximos.length + alertasErosaoMargem.length + alertasRupturaEstoque.length;

  const impactoNoLucro = incluirFluxoNoLucro
    ? resumo.saldo_liquido
    : resumo.entradas_com_lucro + resumo.saidas_com_lucro;

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
      await executarComToast(quitarContaPagarReceber(c.id), { sucesso: "Status atualizado", erro: "Erro ao atualizar status" });
    });
  }

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
                  {/* "Vencido" precisa ser texto, não só a cor do ícone: quem não distingue
                      as duas cores não tem como saber o que já passou do prazo. */}
                  <AlertTriangle size={14} className={c.data_vencimento < hojeIso ? "text-negative" : "text-accent"} />
                  <span className="text-text-primary">{c.descricao}</span>
                  {c.data_vencimento < hojeIso && <StatusChip label="Vencido" tone="negative" />}
                  <span className="text-xs text-text-tertiary">
                    {c.tipo === "pagar" ? "a pagar" : "a receber"} em {formatarDataIso(c.data_vencimento)}
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
                  <Td mono>{formatarDataIso(c.data_vencimento)}</Td>
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
      {ConfirmDialog}
    </>
  );
}
