"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import {
  movimentacoesFinanceiras as movimentacoesIniciais,
  despesasFixas as despesasIniciais,
  contas,
  fluxoCaixaDiario,
  despesasPorCategoria,
  contasPagarReceber as cprIniciais,
  formatBRL,
  type ContaPagarReceber,
} from "@/lib/mock-data";

const FILTROS_CPR = ["Todos", "A Pagar", "A Receber", "Vencidos"] as const;

export default function FinanceiroPage() {
  const [despesas, setDespesas] = useState(despesasIniciais.map((d) => ({ ...d, retirado: true })));
  const [cpr, setCpr] = useState<ContaPagarReceber[]>(cprIniciais);
  const [filtroCpr, setFiltroCpr] = useState<(typeof FILTROS_CPR)[number]>("Todos");
  const [movimentacoesFinanceiras, setMovimentacoesFinanceiras] = useState(movimentacoesIniciais);
  const [modalMovimentacao, setModalMovimentacao] = useState(false);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [incluirFluxoNoLucro, setIncluirFluxoNoLucro] = useState(false);

  const totalEntradas = movimentacoesFinanceiras.filter((m) => m.valor > 0).reduce((a, m) => a + m.valor, 0);
  const totalSaidas = movimentacoesFinanceiras.filter((m) => m.valor < 0).reduce((a, m) => a + m.valor, 0);
  const saldoLiquido = totalEntradas + totalSaidas;
  const custoFixoMensal = despesas.reduce((a, d) => a + d.valor, 0);

  const receitaMensal = fluxoCaixaDiario.reduce((a, d) => a + d.entradas, 0);
  const despesasMensais = despesasPorCategoria.reduce((a, d) => a + d.valor, 0);
  const resultadoMensal = receitaMensal - despesasMensais;
  const margemLiquidaPct = receitaMensal > 0 ? (resultadoMensal / receitaMensal) * 100 : 0;

  const cprFiltrado = cpr.filter((c) => {
    if (filtroCpr === "A Pagar") return c.tipo === "pagar";
    if (filtroCpr === "A Receber") return c.tipo === "receber";
    if (filtroCpr === "Vencidos") return c.status === "pendente";
    return true;
  });

  const totalAPagar = cpr.filter((c) => c.tipo === "pagar" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);
  const totalAReceber = cpr.filter((c) => c.tipo === "receber" && c.status === "pendente").reduce((a, c) => a + c.valor, 0);

  const lancamentosConsiderados = incluirFluxoNoLucro
    ? movimentacoesFinanceiras
    : movimentacoesFinanceiras.filter((m) => m.afetaLucro);
  const impactoNoLucro = lancamentosConsiderados.reduce((a, m) => a + m.valor, 0);

  function alternarRetirada(nome: string) {
    setDespesas((prev) => prev.map((d) => (d.nome === nome ? { ...d, retirado: !d.retirado } : d)));
  }

  function quitar(id: string) {
    setCpr((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: c.tipo === "pagar" ? "pago" : "recebido" } : c)),
    );
    toast.success("Status atualizado");
  }

  function adicionarMovimentacao(dados: (typeof movimentacoesFinanceiras)[number]) {
    setMovimentacoesFinanceiras((prev) => [dados, ...prev]);
    setModalMovimentacao(false);
    toast.success("Movimentação registrada");
  }

  function adicionarDespesaFixa(dados: { nome: string; metodo: string; valor: number; dia: number }) {
    setDespesas((prev) => [...prev, { ...dados, status: "pago", retirado: false }]);
    setModalDespesa(false);
    toast.success("Despesa fixa cadastrada");
  }

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Financeiro"
        actions={
          <>
            <Button variant="secondary" onClick={() => setModalDespesa(true)}>
              Nova Despesa Fixa
            </Button>
            <Button variant="primary" onClick={() => setModalMovimentacao(true)}>
              + Nova Entrada / Saída
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
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
          <h2 className="text-sm font-medium text-text-primary mb-1">Fluxo de Caixa — Últimos 30 dias</h2>
          <p className="text-xs text-text-tertiary mb-2">Entradas e saídas diárias</p>
          <CashFlowChart data={fluxoCaixaDiario} />
        </Card>
        <Card>
          <h2 className="text-sm font-medium text-text-primary mb-1">Saídas por Categoria</h2>
          <p className="text-xs text-text-tertiary mb-2">Mês atual</p>
          <CategoryBarChart data={despesasPorCategoria} />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Contas a Pagar & Receber</h2>
            <p className="text-sm text-text-secondary">
              <span className="text-negative">{formatBRL(totalAPagar)} a pagar</span> ·{" "}
              <span className="text-positive">{formatBRL(totalAReceber)} a receber</span>
            </p>
          </div>
          <div className="flex gap-2">
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
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th>Conta</Th>
              <Th align="right">Valor</Th>
              <Th>Vencimento</Th>
              <Th>Status</Th>
              <Th align="right">Ações</Th>
            </tr>
          </Thead>
          <tbody>
            {cprFiltrado.map((c) => (
              <Tr key={c.id}>
                <Td>{c.descricao}</Td>
                <Td>
                  <StatusChip label={c.tipo === "pagar" ? "A Pagar" : "A Receber"} tone={c.tipo === "pagar" ? "negative" : "positive"} />
                </Td>
                <Td className="text-text-secondary">{c.conta}</Td>
                <Td align="right" mono className={c.tipo === "pagar" ? "text-negative" : "text-positive"}>
                  {formatBRL(c.valor)}
                </Td>
                <Td mono>{c.vencimento}</Td>
                <Td>
                  <StatusChip
                    label={c.status === "pendente" ? "Pendente" : c.status === "pago" ? "Pago" : "Recebido"}
                    tone={c.status === "pendente" ? "neutral" : "positive"}
                  />
                </Td>
                <Td align="right">
                  {c.status === "pendente" && (
                    <button onClick={() => quitar(c.id)} className="text-accent hover:underline text-sm">
                      {c.tipo === "pagar" ? "Marcar pago" : "Marcar recebido"}
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
            {cprFiltrado.length === 0 && (
              <Tr>
                <Td align="center" className="text-text-tertiary text-center py-8">
                  Nada por aqui.
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-wrap gap-3">
            <h2 className="text-base font-semibold text-text-primary">Lançamentos Recentes</h2>
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
              {movimentacoesFinanceiras.map((m, i) => (
                <Tr key={i}>
                  <Td mono>{m.vencimento}</Td>
                  <Td>
                    <div>{m.descricao}</div>
                    <div className="text-xs text-text-tertiary">{m.origem}</div>
                  </Td>
                  <Td>{m.categoria}</Td>
                  <Td>{m.conta}</Td>
                  <Td>
                    <StatusChip label={m.afetaLucro ? "Sim" : "Só caixa"} tone={m.afetaLucro ? "positive" : "neutral"} />
                  </Td>
                  <Td align="right" mono className={m.valor >= 0 ? "text-positive" : "text-negative"}>
                    {m.valor >= 0 ? "+" : "-"} {formatBRL(Math.abs(m.valor))}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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
                <div className="font-mono text-text-primary">{formatBRL(c.saldo)}</div>
              </div>
            ))}
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
        <Table>
          <Thead>
            <tr>
              <Th>Identificador</Th>
              <Th>Método de Cobrança</Th>
              <Th align="right">Custo Mensal</Th>
              <Th align="right">Dia Cobrança</Th>
              <Th>Status</Th>
              <Th align="right">Ações</Th>
            </tr>
          </Thead>
          <tbody>
            {despesas.map((d) => (
              <Tr key={d.nome}>
                <Td>{d.nome}</Td>
                <Td>{d.metodo}</Td>
                <Td align="right" mono>
                  {formatBRL(d.valor)}
                </Td>
                <Td align="right" mono>
                  Dia {d.dia}
                </Td>
                <Td>
                  <StatusChip label={d.retirado ? "Retirado" : "Não retirado"} tone={d.retirado ? "positive" : "neutral"} />
                </Td>
                <Td align="right">
                  <button onClick={() => alternarRetirada(d.nome)} className="text-text-secondary hover:text-text-primary text-sm">
                    {d.retirado ? "Desfazer retirada" : "Retirar da conta"}
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <NovaMovimentacaoModal open={modalMovimentacao} onClose={() => setModalMovimentacao(false)} onSave={adicionarMovimentacao} />
      <NovaDespesaFixaModal open={modalDespesa} onClose={() => setModalDespesa(false)} onSave={adicionarDespesaFixa} />
    </>
  );
}

function NovaMovimentacaoModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dados: {
    vencimento: string;
    descricao: string;
    origem: string;
    categoria: string;
    conta: string;
    valor: number;
    afetaLucro: boolean;
  }) => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [conta, setConta] = useState(contas[0]?.nome ?? "");
  const [valor, setValor] = useState(0);
  const [afetaLucro, setAfetaLucro] = useState(true);

  function salvar() {
    if (!descricao.trim() || valor <= 0) return;
    onSave({
      vencimento: "Hoje",
      descricao,
      origem: "Lançamento manual",
      categoria: categoria || "Outros",
      conta,
      valor: tipo === "entrada" ? valor : -valor,
      afetaLucro,
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
        <select className={inputClass} value={conta} onChange={(e) => setConta(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.nome}>
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
        <Button variant="primary" className="flex-1" onClick={salvar}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function NovaDespesaFixaModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dados: { nome: string; metodo: string; valor: number; dia: number }) => void;
}) {
  const [nome, setNome] = useState("");
  const [metodo, setMetodo] = useState("");
  const [valor, setValor] = useState(0);
  const [dia, setDia] = useState(5);

  function salvar() {
    if (!nome.trim() || valor <= 0) return;
    onSave({ nome, metodo: metodo || "Não informado", valor, dia });
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
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
