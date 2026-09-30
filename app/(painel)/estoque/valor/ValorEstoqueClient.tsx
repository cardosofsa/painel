"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { BarraFiltros, FiltroChips, FiltroSelect } from "@/components/ui/BarraFiltros";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { formatBRL, formatarDataHora } from "@/lib/format";
import type { FatiaValor, GiroProduto, LinhaAbc } from "@/lib/estoque-valor";
import type { TabelaExport } from "@/lib/exportar";
import type { Movimentacao } from "../EstoqueClient";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const COR_ABC = { A: "bg-accent text-accent-on", B: "bg-accent-soft text-accent", C: "bg-surface-2 text-text-secondary" } as const;

function Barras({ titulo, fatias }: { titulo: string; fatias: FatiaValor[] }) {
  return (
    <Card>
      <h3 className="font-semibold text-text-primary mb-3">{titulo}</h3>
      {fatias.length === 0 ? (
        <p className="text-sm text-text-tertiary">Sem estoque.</p>
      ) : (
        <ul className="space-y-3">
          {fatias.map((f) => (
            <li key={f.chave}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-text-primary truncate">{f.rotulo}</span>
                <span className="font-mono tabular text-text-primary shrink-0">{formatBRL(f.valor)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.max(2, Math.round(f.participacao * 100))}%` }} />
                </div>
                <span className="text-xs text-text-tertiary w-28 text-right shrink-0">
                  {f.unidades} un · {pct(f.participacao)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Detalhe do "Valor em estoque": onde o dinheiro está (armazém, categoria), a curva ABC do
 * capital, o que gira e o que está parado, e o histórico de movimentações com filtros.
 */
export function ValorEstoqueClient({
  total,
  porArmazem,
  porCategoria,
  abc,
  giro,
  parados,
  janela,
  armazens,
  movimentacoes,
}: {
  total: number;
  porArmazem: FatiaValor[];
  porCategoria: FatiaValor[];
  abc: LinhaAbc[];
  giro: GiroProduto[];
  parados: GiroProduto[];
  janela: number;
  armazens: { id: string; nome: string }[];
  movimentacoes: Movimentacao[];
}) {
  const [busca, setBusca] = useState("");
  const [armazem, setArmazem] = useState("");
  const [tipo, setTipo] = useState<"todos" | "entrada" | "saida" | "transferencia">("todos");
  const [exportando, setExportando] = useState<"abc" | "movs" | null>(null);
  const nomeArmazem = useMemo(() => new Map(armazens.map((a) => [a.id, a.nome])), [armazens]);

  const movsFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return movimentacoes.filter(
      (m) =>
        (!t || m.produto_nome.toLowerCase().includes(t) || (m.motivo ?? "").toLowerCase().includes(t)) &&
        (!armazem || m.armazem_id === armazem || m.armazem_destino_id === armazem) &&
        (tipo === "todos" || m.tipo === tipo),
    );
  }, [movimentacoes, busca, armazem, tipo]);

  const capitalParado = parados.reduce((s, g) => s + g.produto.estoque * g.produto.custo, 0);
  const contagemAbc = { A: abc.filter((l) => l.classe === "A").length, B: abc.filter((l) => l.classe === "B").length, C: abc.filter((l) => l.classe === "C").length };

  function tabelaAbc(): TabelaExport<LinhaAbc> {
    return {
      titulo: "Curva ABC do estoque",
      colunas: [
        { rotulo: "Classe", valor: (l) => l.classe },
        { rotulo: "SKU", valor: (l) => l.produto.sku },
        { rotulo: "Produto", largura: 36, valor: (l) => l.produto.nome },
        { rotulo: "Estoque", tipo: "inteiro", valor: (l) => l.produto.estoque },
        { rotulo: "Custo", tipo: "moeda", valor: (l) => l.produto.custo },
        { rotulo: "Valor", tipo: "moeda", valor: (l) => l.valor },
        { rotulo: "Participação", tipo: "percentual", valor: (l) => l.participacao },
        { rotulo: "Acumulado", tipo: "percentual", valor: (l) => l.acumulado },
      ],
      linhas: abc,
      total: ["Total", null, null, abc.reduce((s, l) => s + l.produto.estoque, 0), null, total, null, null],
    };
  }

  function tabelaMovs(): TabelaExport<Movimentacao> {
    return {
      titulo: "Entradas e saídas de estoque",
      subtitulo: [armazem ? nomeArmazem.get(armazem) : null, tipo !== "todos" ? tipo : null].filter(Boolean).join(" · ") || undefined,
      colunas: [
        { rotulo: "Data", largura: 18, valor: (m) => formatarDataHora(m.data_movimentacao) },
        { rotulo: "Tipo", valor: (m) => (m.tipo === "entrada" ? "Entrada" : m.tipo === "saida" ? "Saída" : "Transferência") },
        { rotulo: "Produto", largura: 36, valor: (m) => m.produto_nome },
        { rotulo: "Quantidade", tipo: "inteiro", valor: (m) => m.quantidade },
        { rotulo: "Armazém", valor: (m) => nomeArmazem.get(m.armazem_id ?? "") ?? "" },
        { rotulo: "Destino", valor: (m) => nomeArmazem.get(m.armazem_destino_id ?? "") ?? "" },
        { rotulo: "Motivo", largura: 30, valor: (m) => m.motivo ?? "" },
      ],
      linhas: movsFiltradas,
    };
  }

  return (
    <>
      <Link href="/estoque" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Estoque
      </Link>
      <PageHeader title="Valor em estoque" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Valor total (a custo)</CardEyebrow>
          <HeroMetric value={formatBRL(total)} accent />
        </Card>
        <Card>
          <CardEyebrow>Curva A</CardEyebrow>
          <HeroMetric value={`${contagemAbc.A} produtos`} caption="concentram 80% do valor" />
        </Card>
        <Card>
          <CardEyebrow>Parado há {janela} dias</CardEyebrow>
          <HeroMetric value={formatBRL(capitalParado)} caption={`${parados.length} produtos sem saída`} />
        </Card>
        <Card>
          <CardEyebrow>Armazéns com estoque</CardEyebrow>
          <HeroMetric value={String(porArmazem.length)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Barras titulo="Por armazém" fatias={porArmazem} />
        <Barras titulo="Por categoria" fatias={porCategoria} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 items-start">
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-text-primary">Curva ABC do capital</h3>
            <Button variant="secondary" onClick={() => setExportando("abc")} disabled={abc.length === 0}>
              Exportar
            </Button>
          </div>
          <p className="text-xs text-text-tertiary mb-3">A: {contagemAbc.A} · B: {contagemAbc.B} · C: {contagemAbc.C}. Cuide primeiro dos A: é onde está o dinheiro.</p>
          <ul className="divide-y divide-border max-h-96 overflow-y-auto">
            {abc.slice(0, 50).map((l) => (
              <li key={l.produto.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`w-6 h-6 rounded text-xs font-semibold flex items-center justify-center shrink-0 ${COR_ABC[l.classe]}`}>{l.classe}</span>
                <span className="flex-1 min-w-0 truncate text-text-primary">{l.produto.nome}</span>
                <span className="text-xs text-text-tertiary shrink-0">{pct(l.participacao)}</span>
                <span className="font-mono tabular shrink-0 w-24 text-right">{formatBRL(l.valor)}</span>
              </li>
            ))}
            {abc.length === 0 && <li className="py-2 text-sm text-text-tertiary">Sem estoque com custo.</li>}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <h3 className="font-semibold text-text-primary mb-1">Acabando primeiro</h3>
            <p className="text-xs text-text-tertiary mb-3">Pelo ritmo de saída dos últimos {janela} dias.</p>
            <ul className="divide-y divide-border">
              {giro.map((g) => (
                <li key={g.produto.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-text-primary">{g.produto.nome}</span>
                  <span className={`shrink-0 text-xs font-medium ${g.coberturaDias! <= 14 ? "text-negative" : "text-text-secondary"}`}>
                    {g.coberturaDias === 0 ? "acabou" : `~${g.coberturaDias} dias`} · {g.produto.estoque} un
                  </span>
                </li>
              ))}
              {giro.length === 0 && <li className="py-2 text-sm text-text-tertiary">Nenhuma saída registrada no período.</li>}
            </ul>
          </Card>
          <Card>
            <h3 className="font-semibold text-text-primary mb-1">Parados</h3>
            <p className="text-xs text-text-tertiary mb-3">Com estoque e sem nenhuma saída em {janela} dias.</p>
            <ul className="divide-y divide-border max-h-64 overflow-y-auto">
              {parados.map((g) => (
                <li key={g.produto.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate text-text-primary">{g.produto.nome}</span>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {g.produto.estoque} un · <span className="font-mono">{formatBRL(g.produto.estoque * g.produto.custo)}</span>
                  </span>
                </li>
              ))}
              {parados.length === 0 && <li className="py-2 text-sm text-text-tertiary">Tudo girando.</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-text-primary">Entradas e saídas</h3>
          <Button variant="secondary" onClick={() => setExportando("movs")} disabled={movsFiltradas.length === 0}>
            Exportar
          </Button>
        </div>
        <BarraFiltros
          busca={busca}
          onBusca={setBusca}
          placeholder="Produto ou motivo…"
          ativos={(armazem ? 1 : 0) + (tipo === "todos" ? 0 : 1)}
          onLimpar={() => {
            setBusca("");
            setArmazem("");
            setTipo("todos");
          }}
          situacao={
            <FiltroChips
              rotulo="Tipo"
              valor={tipo}
              onChange={setTipo}
              opcoes={[
                { valor: "todos", rotulo: "Todos" },
                { valor: "entrada", rotulo: "Entradas" },
                { valor: "saida", rotulo: "Saídas" },
                { valor: "transferencia", rotulo: "Transferências" },
              ]}
            />
          }
        >
          <FiltroSelect rotulo="Armazém" valor={armazem} onChange={setArmazem} opcoes={armazens.map((a) => ({ valor: a.id, rotulo: a.nome }))} />
        </BarraFiltros>
        <div className="divide-y divide-border">
          {movsFiltradas.slice(0, 100).map((m, i) => (
            <div key={m.id ?? i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="text-text-primary truncate">{m.produto_nome}</div>
                <div className="text-xs text-text-tertiary truncate">
                  {[formatarDataHora(m.data_movimentacao), nomeArmazem.get(m.armazem_id ?? ""), m.tipo === "transferencia" ? `→ ${nomeArmazem.get(m.armazem_destino_id ?? "") ?? "?"}` : null, m.motivo].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className={`font-mono shrink-0 ${m.tipo === "entrada" ? "text-positive" : m.tipo === "saida" ? "text-negative" : "text-text-secondary"}`}>
                {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "-" : "⇄ "}
                {m.quantidade}
              </span>
            </div>
          ))}
          {movsFiltradas.length === 0 && <p className="py-3 text-sm text-text-tertiary">Nenhuma movimentação com esses filtros.</p>}
        </div>
      </Card>

      {exportando === "abc" && (
        <ExportarModal aberto onClose={() => setExportando(null)} titulo="Exportar curva ABC" escopos={[{ id: "todos", rotulo: "Todos", quantidade: abc.length }]} montar={tabelaAbc} />
      )}
      {exportando === "movs" && (
        <ExportarModal
          aberto
          onClose={() => setExportando(null)}
          titulo="Exportar entradas e saídas"
          escopos={[{ id: "filtrados", rotulo: "Filtradas", quantidade: movsFiltradas.length }]}
          montar={tabelaMovs}
        />
      )}
    </>
  );
}
