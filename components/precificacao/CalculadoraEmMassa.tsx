"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL } from "@/lib/mock-data";
import { resolverPorMargem } from "@/lib/pricing";
import { parseCsv, paraCsv, baixarArquivo } from "@/lib/csv";

interface LinhaEmMassa {
  id: string;
  plataforma: string;
  sku: string;
  custo: number;
  comissaoPct: number;
  taxaFixa: number;
  impostoPct: number;
  margemPct: number;
  precoAtual: number;
}

let nextId = 1;

function linhaVazia(): LinhaEmMassa {
  nextId += 1;
  return {
    id: `linha-${nextId}`,
    plataforma: "Shopee",
    sku: "",
    custo: 0,
    comissaoPct: 20,
    taxaFixa: 4,
    impostoPct: 6,
    margemPct: 25,
    precoAtual: 0,
  };
}

export function CalculadoraEmMassa() {
  const [linhas, setLinhas] = useState<LinhaEmMassa[]>([linhaVazia()]);
  const [visualizacao, setVisualizacao] = useState<"tabela" | "resultado">("tabela");
  const [filtroResultado, setFiltroResultado] = useState<"todos" | "subir" | "ok">("todos");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function atualizarLinha(id: string, campo: keyof LinhaEmMassa, valor: string) {
    setLinhas((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, [campo]: campo === "plataforma" || campo === "sku" ? valor : Number(valor) || 0 }
          : l,
      ),
    );
  }

  function adicionarLinha() {
    setLinhas((prev) => [...prev, linhaVazia()]);
  }

  function removerLinha(id: string) {
    setLinhas((prev) => prev.filter((l) => l.id !== id));
  }

  function limparTabela() {
    setLinhas([linhaVazia()]);
  }

  function importarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const registros = parseCsv(String(reader.result ?? ""));
      const novas: LinhaEmMassa[] = registros.map((r) => {
        nextId += 1;
        return {
          id: `linha-${nextId}`,
          plataforma: r.plataforma || "Shopee",
          sku: r.sku || "",
          custo: Number(r.custo) || 0,
          comissaoPct: Number(r.comissao) || 0,
          taxaFixa: Number(r.taxafixa) || 0,
          impostoPct: Number(r.impostos) || 0,
          margemPct: Number(r.margem) || 0,
          precoAtual: Number(r.precoatual) || 0,
        };
      });
      if (novas.length === 0) {
        toast.error("Não encontrei linhas válidas nesse CSV");
        return;
      }
      setLinhas(novas);
      toast.success(`${novas.length} linha(s) importada(s)`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const resultados = useMemo(
    () =>
      linhas
        .filter((l) => l.sku.trim() !== "" && l.custo > 0)
        .map((l) => {
          const resultado = resolverPorMargem(l.custo, l.margemPct / 100, {
            impostoPct: l.impostoPct / 100,
            taxaFixa: l.taxaFixa,
            taxaVariavelPct: l.comissaoPct / 100,
            taxaAdicionalPct: 0,
          });
          const diferenca = resultado.precoVenda - l.precoAtual;
          return { linha: l, resultado, diferenca, precisaSubir: l.precoAtual > 0 && diferenca > 0.01 };
        }),
    [linhas],
  );

  const itensSubirPreco = resultados.filter((r) => r.precisaSubir);
  const itensOk = resultados.filter((r) => !r.precisaSubir);
  const diferencaMedia =
    itensSubirPreco.length > 0 ? itensSubirPreco.reduce((a, r) => a + r.diferenca, 0) / itensSubirPreco.length : 0;
  const margemExtraOk = itensOk.reduce((a, r) => a + Math.max(0, -r.diferenca), 0);

  const resultadosFiltrados = resultados.filter((r) => {
    if (filtroResultado === "subir") return r.precisaSubir;
    if (filtroResultado === "ok") return !r.precisaSubir;
    return true;
  });

  function calcularTodos() {
    if (resultados.length === 0) {
      toast.error("Adicione ao menos uma linha com SKU e custo preenchidos");
      return;
    }
    setVisualizacao("resultado");
  }

  function exportarCsv() {
    const colunas = ["plataforma", "sku", "custo", "precoSugerido", "precoAtual", "diferenca", "novoLucro"];
    const linhasCsv = resultados.map((r) => ({
      plataforma: r.linha.plataforma,
      sku: r.linha.sku,
      custo: r.linha.custo.toFixed(2),
      precoSugerido: r.resultado.precoVenda.toFixed(2),
      precoAtual: r.linha.precoAtual.toFixed(2),
      diferenca: r.diferenca.toFixed(2),
      novoLucro: r.resultado.lucroLiquido.toFixed(2),
    }));
    baixarArquivo("precificacao-em-massa.csv", paraCsv(linhasCsv, colunas));
    toast.success("CSV exportado");
  }

  if (visualizacao === "resultado") {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardEyebrow>Itens para Subir Preço</CardEyebrow>
            <HeroMetric
              value={`${itensSubirPreco.length} de ${resultados.length}`}
              caption={itensSubirPreco.length > 0 ? `Diferença média ${formatBRL(diferencaMedia)}` : undefined}
            />
          </Card>
          <Card>
            <CardEyebrow>Itens OK</CardEyebrow>
            <HeroMetric
              value={`${itensOk.length} de ${resultados.length}`}
              caption={margemExtraOk > 0.01 ? `+${formatBRL(margemExtraOk)} em margem extra` : "Nenhum item com margem extra"}
            />
          </Card>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {(
              [
                { id: "todos" as const, label: `Todos (${resultados.length})` },
                { id: "subir" as const, label: `Subir preço (${itensSubirPreco.length})` },
                { id: "ok" as const, label: `OK (${itensOk.length})` },
              ]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltroResultado(f.id)}
                className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                  filtroResultado === f.id
                    ? "bg-surface-3 border-border text-text-primary font-medium"
                    : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Card className="p-0 overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Plataforma</Th>
                <Th>SKU</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Preço Sugerido</Th>
                <Th align="right">Preço Atual</Th>
                <Th align="right">Diferença</Th>
                <Th align="right">Novo Lucro Esperado</Th>
              </tr>
            </Thead>
            <tbody>
              {resultadosFiltrados.map((r) => (
                <Tr key={r.linha.id}>
                  <Td>{r.linha.plataforma}</Td>
                  <Td mono className="text-accent">
                    {r.linha.sku}
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(r.linha.custo)}
                  </Td>
                  <Td align="right" mono className="text-accent">
                    {formatBRL(r.resultado.precoVenda)}
                  </Td>
                  <Td align="right" mono>
                    {r.linha.precoAtual > 0 ? formatBRL(r.linha.precoAtual) : "—"}
                  </Td>
                  <Td align="right" mono className={r.diferenca > 0 ? "text-negative" : "text-positive"}>
                    {r.linha.precoAtual > 0 ? `${r.diferenca >= 0 ? "-" : "+"} ${formatBRL(Math.abs(r.diferenca))}` : "—"}
                  </Td>
                  <Td align="right" mono className="text-positive">
                    {formatBRL(r.resultado.lucroLiquido)}
                  </Td>
                </Tr>
              ))}
              {resultadosFiltrados.length === 0 && (
                <Tr>
                  <Td align="center" className="text-text-tertiary text-center py-8">
                    Nada nessa categoria.
                  </Td>
                </Tr>
              )}
            </tbody>
          </Table>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setVisualizacao("tabela")}>
            ← Voltar e editar
          </Button>
          <Button variant="primary" onClick={exportarCsv}>
            Exportar CSV
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-text-primary">Adicione produtos para precificar</h3>
          <p className="text-sm text-text-secondary">Edite a tabela manualmente ou importe um CSV.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={importarCsv} />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Importar CSV
          </Button>
        </div>
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>Plataforma</Th>
            <Th>SKU</Th>
            <Th align="right">Custo (R$)</Th>
            <Th align="right">Comissão (%)</Th>
            <Th align="right">Taxa Fixa (R$)</Th>
            <Th align="right">Impostos (%)</Th>
            <Th align="right">Margem (%)</Th>
            <Th align="right">Preço Atual (R$)</Th>
            <Th></Th>
          </tr>
        </Thead>
        <tbody>
          {linhas.map((l) => (
            <Tr key={l.id}>
              <Td>
                <input
                  value={l.plataforma}
                  onChange={(e) => atualizarLinha(l.id, "plataforma", e.target.value)}
                  className="w-24 bg-transparent text-text-primary outline-none"
                />
              </Td>
              <Td>
                <input
                  value={l.sku}
                  onChange={(e) => atualizarLinha(l.id, "sku", e.target.value)}
                  className="w-28 bg-transparent text-text-primary outline-none"
                  placeholder="SKU"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.01"
                  value={l.custo || ""}
                  onChange={(e) => atualizarLinha(l.id, "custo", e.target.value)}
                  className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.1"
                  value={l.comissaoPct}
                  onChange={(e) => atualizarLinha(l.id, "comissaoPct", e.target.value)}
                  className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.01"
                  value={l.taxaFixa}
                  onChange={(e) => atualizarLinha(l.id, "taxaFixa", e.target.value)}
                  className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.1"
                  value={l.impostoPct}
                  onChange={(e) => atualizarLinha(l.id, "impostoPct", e.target.value)}
                  className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.1"
                  value={l.margemPct}
                  onChange={(e) => atualizarLinha(l.id, "margemPct", e.target.value)}
                  className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                />
              </Td>
              <Td align="right">
                <input
                  type="number"
                  step="0.01"
                  value={l.precoAtual || ""}
                  onChange={(e) => atualizarLinha(l.id, "precoAtual", e.target.value)}
                  className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                  placeholder="—"
                />
              </Td>
              <Td align="right">
                <button onClick={() => removerLinha(l.id)} className="text-text-tertiary hover:text-negative">
                  ×
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-4">
          <button onClick={adicionarLinha} className="text-sm text-accent hover:underline">
            + Adicionar linha
          </button>
          <button onClick={limparTabela} className="text-sm text-text-tertiary hover:text-negative">
            Limpar tabela
          </button>
        </div>
        <span className="text-xs text-text-tertiary">{linhas.length} / 200 linhas</span>
      </div>

      <Button variant="primary" className="w-full mt-4" onClick={calcularTodos}>
        Calcular Todos
      </Button>
    </Card>
  );
}
