"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Chip } from "@/components/ui/Chip";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { FaturamentoLucroChart } from "@/components/charts/FaturamentoLucroChart";
import { formatBRL } from "@/lib/format";
import { porChave, porProduto, serieDiaria, totais, variacao, type LinhaProduto, type VendaRelatorio } from "@/lib/relatorios-vendas";
import type { TabelaExport } from "@/lib/exportar";

type Aba = "geral" | "performance" | "anuncio" | "abc" | "estado" | "lucros";
const ABAS: { value: Aba; label: string }[] = [
  { value: "geral", label: "Vista geral" },
  { value: "performance", label: "Performance" },
  { value: "anuncio", label: "Por produto" },
  { value: "abc", label: "Análise ABC" },
  { value: "estado", label: "Por estado" },
  { value: "lucros", label: "Lucros" },
];
const PERIODOS = [7, 30, 90, 365] as const;
const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Kpi({ rotulo, valor, delta }: { rotulo: string; valor: string; delta: number | null }) {
  const Icone = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <Card>
      <CardEyebrow>{rotulo}</CardEyebrow>
      <div className="text-xl font-semibold font-mono tabular text-text-primary mt-1">{valor}</div>
      <div className={`text-xs mt-0.5 ${delta == null ? "text-text-tertiary" : delta >= 0 ? "text-positive" : "text-negative"}`}>
        {delta == null ? "sem período anterior" : (
          <span className="inline-flex items-center gap-0.5">
            <Icone size={12} /> {delta > 0 ? "+" : ""}
            {pct(delta)} vs. período anterior
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Relatórios de vendas: saíram da tela de Vendas (que agora é operação). Todas as origens
 * juntas — PDV e catálogo; marketplace entra na 8.9 — com comparação ao período anterior.
 */
export function RelatoriosVendasClient({ vendas, agoraIso }: { vendas: VendaRelatorio[]; agoraIso: string }) {
  const [aba, setAba] = useState<Aba>("geral");
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [exportando, setExportando] = useState(false);

  const { atual, anterior, inicio, fim } = useMemo(() => {
    const fim = new Date(agoraIso);
    const inicio = new Date(fim);
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (dias - 1));
    const inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - dias);
    return {
      atual: vendas.filter((v) => new Date(v.data) >= inicio),
      anterior: vendas.filter((v) => new Date(v.data) >= inicioAnterior && new Date(v.data) < inicio),
      inicio,
      fim,
    };
  }, [vendas, dias, agoraIso]);

  const t = totais(atual);
  const ta = totais(anterior);
  const serie = useMemo(
    () =>
      serieDiaria(atual, inicio, fim).map((d) => ({
        ...d,
        dia: new Date(`${d.dia}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      })),
    [atual, inicio, fim],
  );
  const produtos = useMemo(() => porProduto(atual), [atual]);
  const estados = useMemo(() => porChave(atual, "uf"), [atual]);
  const origens = useMemo(() => porChave(atual, "origem"), [atual]);
  const porDiaSemana = useMemo(() => {
    const m = DIAS_SEMANA.map((rotulo) => ({ rotulo, pedidos: 0, faturamento: 0 }));
    for (const v of atual) {
      const d = new Date(v.data).getDay();
      m[d].pedidos++;
      m[d].faturamento += v.total;
    }
    return m;
  }, [atual]);
  const maxDiaSemana = Math.max(1, ...porDiaSemana.map((d) => d.faturamento));
  const abc = { A: produtos.filter((p) => p.classe === "A"), B: produtos.filter((p) => p.classe === "B"), C: produtos.filter((p) => p.classe === "C") };

  function tabelaProdutos(): TabelaExport<LinhaProduto> {
    return {
      titulo: `Vendas por produto — últimos ${dias} dias`,
      colunas: [
        { rotulo: "Classe", valor: (l) => l.classe },
        { rotulo: "Produto", largura: 36, valor: (l) => l.nome },
        { rotulo: "Pedidos", tipo: "inteiro", valor: (l) => l.pedidos },
        { rotulo: "Unidades", tipo: "inteiro", valor: (l) => l.quantidade },
        { rotulo: "Faturamento", tipo: "moeda", valor: (l) => l.receita },
        { rotulo: "Lucro", tipo: "moeda", valor: (l) => l.lucro },
        { rotulo: "Participação", tipo: "percentual", valor: (l) => l.participacao },
      ],
      linhas: produtos,
      total: ["Total", null, null, produtos.reduce((s, l) => s + l.quantidade, 0), produtos.reduce((s, l) => s + l.receita, 0), produtos.reduce((s, l) => s + l.lucro, 0), null],
    };
  }

  const tabelaResumo = (linhas: { chave: string; pedidos: number; faturamento: number; lucro: number; participacao: number }[], coluna: string) => (
    <Table>
      <Thead>
        <tr>
          <Th>{coluna}</Th>
          <Th align="right">Pedidos</Th>
          <Th align="right">Faturamento</Th>
          <Th align="right">Lucro</Th>
          <Th align="right">Participação</Th>
        </tr>
      </Thead>
      <tbody>
        {linhas.map((l) => (
          <Tr key={l.chave}>
            <Td>{l.chave}</Td>
            <Td align="right" mono>
              {l.pedidos}
            </Td>
            <Td align="right" mono>
              {formatBRL(l.faturamento)}
            </Td>
            <Td align="right" mono>
              {formatBRL(l.lucro)}
            </Td>
            <Td align="right">{pct(l.participacao)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <>
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Vendas
      </Link>
      <PageHeader
        title="Relatórios de vendas"
        actions={
          <Button variant="secondary" onClick={() => setExportando(true)} disabled={produtos.length === 0}>
            Exportar por produto
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODOS.map((p) => (
          <Chip key={p} ativo={dias === p} onClick={() => setDias(p)}>
            {p === 365 ? "12 meses" : `${p} dias`}
          </Chip>
        ))}
      </div>

      <Tabs tabs={ABAS} value={aba} onChange={setAba} className="mb-4" />

      {aba === "geral" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi rotulo="Faturamento" valor={formatBRL(t.faturamento)} delta={variacao(t.faturamento, ta.faturamento)} />
            <Kpi rotulo="Lucro" valor={formatBRL(t.lucro)} delta={variacao(t.lucro, ta.lucro)} />
            <Kpi rotulo="Pedidos" valor={String(t.pedidos)} delta={variacao(t.pedidos, ta.pedidos)} />
            <Kpi rotulo="Ticket médio" valor={formatBRL(t.ticketMedio)} delta={variacao(t.ticketMedio, ta.ticketMedio)} />
          </div>
          <Card>
            <CardEyebrow>Faturamento e lucro por dia</CardEyebrow>
            <div className="mt-3">
              <FaturamentoLucroChart data={serie} />
            </div>
          </Card>
          <Card padding="nenhum" className="overflow-hidden">
            <div className="px-5 pt-4 pb-2 font-semibold text-text-primary">Por origem</div>
            {tabelaResumo(origens, "Origem")}
          </Card>
        </div>
      )}

      {aba === "performance" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold text-text-primary mb-3">Por dia da semana</h3>
            <ul className="space-y-2.5">
              {porDiaSemana.map((d) => (
                <li key={d.rotulo} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-text-secondary">{d.rotulo}</span>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(d.faturamento / maxDiaSemana) * 100}%` }} />
                  </div>
                  <span className="font-mono text-xs w-32 text-right">
                    {formatBRL(d.faturamento)} · {d.pedidos}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="font-semibold text-text-primary mb-3">Indicadores</h3>
            <dl className="divide-y divide-border text-sm">
              {[
                ["Unidades vendidas", String(t.unidades), variacao(t.unidades, ta.unidades)],
                ["Itens por pedido", t.pedidos ? (t.unidades / t.pedidos).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0", null],
                ["Margem de lucro", pct(t.margem), variacao(t.margem, ta.margem)],
                ["Custo dos produtos", formatBRL(t.custo), variacao(t.custo, ta.custo)],
                ["Produtos diferentes vendidos", String(produtos.length), null],
              ].map(([r, v, d]) => (
                <div key={r as string} className="flex justify-between py-2">
                  <dt className="text-text-secondary">{r}</dt>
                  <dd className="font-mono">
                    {v}
                    {d != null && <span className={`ml-2 text-xs ${(d as number) >= 0 ? "text-positive" : "text-negative"}`}>{`${(d as number) > 0 ? "+" : ""}${pct(d as number)}`}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      )}

      {(aba === "anuncio" || aba === "lucros") && (
        <Card padding="nenhum" className="overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Produto</Th>
                <Th align="right">Pedidos</Th>
                <Th align="right">Unidades</Th>
                <Th align="right">Faturamento</Th>
                <Th align="right">Lucro</Th>
                <Th align="right">{aba === "lucros" ? "Margem" : "Participação"}</Th>
              </tr>
            </Thead>
            <tbody>
              {(aba === "lucros" ? [...produtos].sort((a, b) => b.lucro - a.lucro) : produtos).map((l) => (
                <Tr key={l.chave}>
                  <Td>
                    <div className="max-w-[22rem] truncate">{l.nome}</div>
                  </Td>
                  <Td align="right" mono>
                    {l.pedidos}
                  </Td>
                  <Td align="right" mono>
                    {l.quantidade}
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(l.receita)}
                  </Td>
                  <Td align="right" mono>
                    <span className={l.lucro < 0 ? "text-negative" : ""}>{formatBRL(l.lucro)}</span>
                  </Td>
                  <Td align="right">{aba === "lucros" ? pct(l.receita > 0 ? l.lucro / l.receita : 0) : pct(l.participacao)}</Td>
                </Tr>
              ))}
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-sm text-text-tertiary">
                    Nenhuma venda no período.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {aba === "abc" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(["A", "B", "C"] as const).map((c) => {
            const lista = abc[c];
            const receita = lista.reduce((s, l) => s + l.receita, 0);
            return (
              <Card key={c}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-text-primary">Classe {c}</span>
                  <span className="text-xs text-text-tertiary">{c === "A" ? "até 80% do faturamento" : c === "B" ? "próximos 15%" : "últimos 5%"}</span>
                </div>
                <div className="text-sm text-text-secondary mt-1">
                  {lista.length} produto(s) · {formatBRL(receita)} · {pct(t.faturamento > 0 ? receita / t.faturamento : 0)}
                </div>
                <ul className="mt-3 divide-y divide-border max-h-72 overflow-y-auto">
                  {lista.map((l) => (
                    <li key={l.chave} className="flex justify-between gap-3 py-1.5 text-sm">
                      <span className="truncate">{l.nome}</span>
                      <span className="font-mono shrink-0">{formatBRL(l.receita)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-tertiary mt-3">
                  {c === "A" ? "Nunca deixe faltar: priorize estoque e anúncio." : c === "B" ? "Bons coadjuvantes: bons para kits e combos." : "Avalie: rever preço, divulgar ou tirar de linha."}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {aba === "estado" && (
        <Card padding="nenhum" className="overflow-hidden">
          <p className="px-5 pt-4 text-xs text-text-tertiary">Pelo endereço do cliente cadastrado ou da entrega do pedido do catálogo.</p>
          {tabelaResumo(estados, "Estado")}
        </Card>
      )}

      {exportando && <ExportarModal aberto onClose={() => setExportando(false)} titulo="Exportar vendas por produto" escopos={[{ id: "todos", rotulo: "Período", quantidade: produtos.length }]} montar={tabelaProdutos} />}
    </>
  );
}
