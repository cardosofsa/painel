"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, classeValor } from "@/lib/format";
import { resolverPorMargem, resolverComFaixas, type FaixaComissao } from "@/lib/pricing";
import { paraCsv, baixarArquivo } from "@/lib/csv";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import {
  type ResumoExport,
  DetalhamentoPrecificacao,
  useExportarPrecificacao,
  SimuladorPreco,
} from "@/components/precificacao/resultado-compartilhado";
import { salvarPrecificacoesEmMassa } from "@/app/(painel)/precificacao/actions";
import type { PrecificacaoHist } from "@/app/(painel)/precificacao/PrecificacaoClient";

interface ProdutoOpcao {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  preco_venda: number;
}

interface LojaOpcao {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
}

interface LinhaEmMassa {
  id: string;
  produtoId: string | null;
  sku: string;
  nome: string;
  custo: number;
  lojaId: string | null;
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
    produtoId: null,
    sku: "",
    nome: "",
    custo: 0,
    lojaId: null,
    comissaoPct: 20,
    taxaFixa: 4,
    impostoPct: 6,
    margemPct: 25,
    precoAtual: 0,
  };
}

export function CalculadoraEmMassa({
  produtos,
  lojas,
  historico,
  setVisao,
}: {
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  historico: PrecificacaoHist[];
  setVisao: (visao: "individual" | "variacoes" | "massa" | "historico") => void;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [linhas, setLinhas] = useState<LinhaEmMassa[]>([linhaVazia()]);
  const [visualizacao, setVisualizacao] = useState<"tabela" | "resultado">("tabela");
  const [filtroResultado, setFiltroResultado] = useState<"todos" | "subir" | "ok">("todos");
  const [sugestaoAbertaId, setSugestaoAbertaId] = useState<string | null>(null);
  const [linhaExpandidaId, setLinhaExpandidaId] = useState<string | null>(null);
  const salvosRecentes = useMemo(() => historico.filter((h) => h.origem === "em_massa").slice(0, 5), [historico]);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao();

  function sugestoesPorNome(nome: string) {
    const q = nome.trim().toLowerCase();
    if (!q) return [];
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 6);
  }

  function vincularProdutoPorNome(id: string, produto: ProdutoOpcao) {
    setLinhas((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, produtoId: produto.id, nome: produto.nome, sku: produto.sku, custo: produto.custo, precoAtual: produto.preco_venda }
          : l,
      ),
    );
    setSugestaoAbertaId(null);
  }

  function atualizarLinha(id: string, campo: keyof LinhaEmMassa, valor: string) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (campo === "sku") {
          const produto = produtos.find((p) => p.sku.toLowerCase() === valor.trim().toLowerCase());
          if (produto) {
            return { ...l, sku: valor, produtoId: produto.id, nome: produto.nome, custo: produto.custo, precoAtual: produto.preco_venda };
          }
          return { ...l, sku: valor, produtoId: null };
        }
        if (campo === "nome") {
          return { ...l, nome: valor, produtoId: null };
        }
        if (campo === "lojaId") {
          const loja = lojas.find((lj) => lj.id === valor);
          return {
            ...l,
            lojaId: valor || null,
            comissaoPct: loja && loja.tipoTaxa === "fixo" ? loja.comissaoPct : l.comissaoPct,
            taxaFixa: loja && loja.tipoTaxa === "fixo" ? loja.taxaFixa : l.taxaFixa,
          };
        }
        return { ...l, [campo]: Number(valor) || 0 };
      }),
    );
  }

  function adicionarLinha() {
    setLinhas((prev) => [...prev, linhaVazia()]);
  }

  function removerLinha(id: string) {
    setLinhas((prev) => prev.filter((l) => l.id !== id));
  }

  async function limparTabela() {
    // Pode haver até 200 linhas digitadas à mão, e o botão fica ao lado de
    // "+ Adicionar linha". Sem confirmação nem desfazer, um clique errado apagava tudo.
    const preenchidas = linhas.filter((l) => l.sku.trim() !== "" || l.nome.trim() !== "").length;
    if (preenchidas > 0) {
      const ok = await confirm({
        title: "Limpar a tabela?",
        message: `${preenchidas} linha(s) preenchida(s) serão apagadas. Não dá para desfazer.`,
        confirmLabel: "Limpar tudo",
      });
      if (!ok) return;
    }
    setLinhas([linhaVazia()]);
  }

  const resultados = useMemo(
    () =>
      linhas
        .filter((l) => (l.sku.trim() !== "" || l.nome.trim() !== "") && l.custo > 0)
        .map((l) => {
          const loja = lojas.find((lj) => lj.id === l.lojaId) ?? null;
          if (loja?.tipoTaxa === "faixas") {
            const { resultado, faixa } = resolverComFaixas(
              l.custo,
              "margem",
              l.margemPct / 100,
              { impostoPct: l.impostoPct / 100, taxaAdicionalPct: 0, taxaExtraValor: loja.taxaExtraValor ?? undefined, taxaExtraTipo: loja.taxaExtraTipo },
              loja.faixas,
            );
            const diferenca = resultado.precoVenda - l.precoAtual;
            return { linha: l, loja, faixa, resultado, diferenca, precisaSubir: l.precoAtual > 0 && diferenca > 0.01 };
          }
          const comissaoPct = loja ? loja.comissaoPct : l.comissaoPct;
          const taxaFixa = loja ? loja.taxaFixa : l.taxaFixa;
          const resultado = resolverPorMargem(l.custo, l.margemPct / 100, {
            impostoPct: l.impostoPct / 100,
            taxaFixa,
            taxaVariavelPct: comissaoPct / 100,
            taxaAdicionalPct: 0,
            taxaExtraValor: loja?.taxaExtraValor ?? undefined,
            taxaExtraTipo: loja?.taxaExtraTipo,
          });
          const diferenca = resultado.precoVenda - l.precoAtual;
          return { linha: l, loja, faixa: null, resultado, diferenca, precisaSubir: l.precoAtual > 0 && diferenca > 0.01 };
        }),
    [linhas, lojas],
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
    const colunas = ["loja", "sku", "nome", "custo", "precoSugerido", "precoAtual", "diferenca", "novoLucro"];
    const linhasCsv = resultados.map((r) => ({
      loja: r.loja ? `${r.loja.canalNome} — ${r.loja.nome}` : "Manual",
      sku: r.linha.sku,
      nome: r.linha.nome,
      custo: r.linha.custo.toFixed(2),
      precoSugerido: r.resultado.precoVenda.toFixed(2),
      precoAtual: r.linha.precoAtual.toFixed(2),
      diferenca: r.diferenca.toFixed(2),
      novoLucro: r.resultado.lucroLiquido.toFixed(2),
    }));
    baixarArquivo("precificacao-em-massa.csv", paraCsv(linhasCsv, colunas));
    toast.success("CSV exportado");
  }

  function resumoDeResultadoEmMassa(r: (typeof resultados)[number]): ResumoExport {
    const taxaVariavelPct = r.faixa ? r.faixa.comissaoPct / 100 : (r.loja ? r.loja.comissaoPct : r.linha.comissaoPct) / 100;
    const taxaFixa = r.faixa ? r.faixa.tarifaFixa : r.loja ? r.loja.taxaFixa : r.linha.taxaFixa;
    return {
      titulo: r.linha.nome || r.linha.sku || "Produto",
      precoVenda: r.resultado.precoVenda,
      custoTotal: r.resultado.custoTotal,
      taxaVariavelValor: r.resultado.taxaVariavelValor,
      taxaVariavelPct,
      taxaFixa,
      taxaAdicionalValor: r.resultado.taxaAdicionalValor,
      taxaAdicionalPct: 0,
      impostoValor: r.resultado.impostoValor,
      impostoPct: r.linha.impostoPct / 100,
      taxaExtraCalculada: r.resultado.taxaExtraCalculada,
      lucroLiquido: r.resultado.lucroLiquido,
      margemEfetivaPct: r.resultado.margemEfetivaPct,
      componentes: null,
      faixaVenda: null,
    };
  }

  function salvarNoHistorico() {
    startTransition(async () => {
      // Um INSERT só, em vez de uma Server Action por linha. E o erro é mostrado inteiro:
      // o `catch { falhas += 1 }` de antes engolia a mensagem, e o usuário via "12 linha(s)
      // falharam" sem nunca descobrir o motivo.
      try {
        const total = await salvarPrecificacoesEmMassa(
          resultados.map((r) => ({
            produto_id: r.linha.produtoId,
            produto_nome: r.linha.nome || r.linha.sku,
            canal: r.loja ? `${r.loja.canalNome} — ${r.loja.nome}` : null,
            titulo_anuncio: null,
            loja_id: r.loja?.id ?? null,
            componentes: null,
            taxa_extra_valor: r.loja?.taxaExtraValor ?? null,
            taxa_extra_tipo: r.loja?.taxaExtraTipo ?? null,
            custo: r.linha.custo,
            taxa_variavel_pct: r.faixa ? r.faixa.comissaoPct / 100 : (r.loja ? r.loja.comissaoPct : r.linha.comissaoPct) / 100,
            taxa_fixa: r.faixa ? r.faixa.tarifaFixa : r.loja ? r.loja.taxaFixa : r.linha.taxaFixa,
            taxa_adicional_pct: 0,
            imposto_pct: r.linha.impostoPct / 100,
            margem_pct: r.linha.margemPct / 100,
            preco_calculado: r.resultado.precoVenda,
            lucro: r.resultado.lucroLiquido,
            origem: "em_massa" as const,
          })),
        );
        toast.success(`${total} precificação(ões) salva(s) no histórico`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar as precificações");
      }
    });
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
                <Th>Loja</Th>
                <Th>SKU</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Preço Sugerido</Th>
                <Th align="right">Preço Atual</Th>
                <Th align="right">Diferença</Th>
                <Th align="right">Novo Lucro Esperado</Th>
                <Th></Th>
              </tr>
            </Thead>
            <tbody>
              {resultadosFiltrados.map((r) => {
                const expandida = linhaExpandidaId === r.linha.id;
                return (
                  <Fragment key={r.linha.id}>
                    <Tr>
                      <Td>{r.loja ? `${r.loja.canalNome} — ${r.loja.nome}` : "Manual"}</Td>
                      <Td mono className="text-accent">
                        {r.linha.sku || r.linha.nome}
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
                      <Td align="right" mono className={classeValor(r.resultado.lucroLiquido)}>
                        {formatBRL(r.resultado.lucroLiquido)}
                      </Td>
                      <Td align="right">
                        <button
                          onClick={() => setLinhaExpandidaId(expandida ? null : r.linha.id)}
                          className="text-text-tertiary hover:text-text-primary"
                        >
                          {expandida ? "▲" : "▾"}
                        </button>
                      </Td>
                    </Tr>
                    {expandida && (
                      <tr>
                        <td colSpan={8} className="bg-surface-2/40 px-5 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <Card className={r.resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-text-tertiary uppercase">
                                  Resultado — {r.linha.nome || r.linha.sku}
                                </span>
                                <StatusChip label={r.resultado.viavel ? "Viável" : "Inviável"} tone={r.resultado.viavel ? "positive" : "negative"} />
                              </div>
                              <div className="text-center py-4">
                                <div className="text-xs text-text-tertiary mb-1">Preço de Venda Recomendado</div>
                                <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(r.resultado.precoVenda)}</div>
                              </div>
                              <div className="pt-4 border-t border-border text-sm space-y-1.5">
                                <DetalhamentoPrecificacao
                                  aberto
                                  onToggle={() => {}}
                                  componentes={null}
                                  custoTotal={r.resultado.custoTotal}
                                  taxaVariavelValor={r.resultado.taxaVariavelValor}
                                  taxaVariavelPct={r.faixa ? r.faixa.comissaoPct / 100 : (r.loja ? r.loja.comissaoPct : r.linha.comissaoPct) / 100}
                                  taxaFixa={r.faixa ? r.faixa.tarifaFixa : r.loja ? r.loja.taxaFixa : r.linha.taxaFixa}
                                  taxaAdicionalValor={r.resultado.taxaAdicionalValor}
                                  taxaAdicionalPct={0}
                                  taxaExtraCalculada={r.resultado.taxaExtraCalculada}
                                  impostoValor={r.resultado.impostoValor}
                                  impostoPct={r.linha.impostoPct / 100}
                                />
                                <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                                  <span className="text-text-primary">Lucro líquido</span>
                                  <span className={`font-mono ${r.resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                                    {formatBRL(r.resultado.lucroLiquido)} ({(r.resultado.margemEfetivaPct * 100).toFixed(1)}%)
                                  </span>
                                </div>
                                <div className="flex justify-between text-text-tertiary text-xs">
                                  <span>Margem sobre custo</span>
                                  <span className="font-mono">{(r.resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
                                </div>
                              </div>
                              <div className="mt-3">
                                <SimuladorPreco
                                  custoTotal={r.resultado.custoTotal}
                                  taxas={{
                                    impostoPct: r.linha.impostoPct / 100,
                                    taxaFixa: r.faixa ? r.faixa.tarifaFixa : r.loja ? r.loja.taxaFixa : r.linha.taxaFixa,
                                    taxaVariavelPct: r.faixa ? r.faixa.comissaoPct / 100 : (r.loja ? r.loja.comissaoPct : r.linha.comissaoPct) / 100,
                                    taxaAdicionalPct: 0,
                                    taxaExtraValor: r.loja?.taxaExtraValor ?? undefined,
                                    taxaExtraTipo: r.loja?.taxaExtraTipo ?? null,
                                  }}
                                />
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  variant="secondary"
                                  className="flex-1"
                                  onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDeResultadoEmMassa(r) })}
                                >
                                  Copiar
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="flex-1"
                                  onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDeResultadoEmMassa(r) })}
                                >
                                  Enviar WhatsApp
                                </Button>
                              </div>
                              <Button
                                variant="secondary"
                                className="w-full mt-2"
                                onClick={() => setPendenteImagem(resumoDeResultadoEmMassa(r))}
                              >
                                Imagem
                              </Button>
                            </Card>
                            <Card>
                              <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
                              <PriceBreakdownChart
                                data={[
                                  { nome: "Custo", valor: r.resultado.custoTotal },
                                  {
                                    nome: "Taxas da plataforma",
                                    valor:
                                      (r.faixa ? r.faixa.tarifaFixa : r.loja ? r.loja.taxaFixa : r.linha.taxaFixa) +
                                      r.resultado.taxaVariavelValor +
                                      r.resultado.taxaAdicionalValor +
                                      r.resultado.taxaExtraCalculada,
                                  },
                                  { nome: "Imposto", valor: r.resultado.impostoValor },
                                  { nome: "Lucro líquido", valor: Math.max(0, r.resultado.lucroLiquido) },
                                ]}
                              />
                            </Card>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => setVisualizacao("tabela")}>
            ← Voltar e editar
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportarCsv}>
              Exportar CSV
            </Button>
            <Button variant="primary" onClick={salvarNoHistorico} loading={pending}>
              Salvar no Histórico
            </Button>
          </div>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Precificações Salvas</h2>
            <button
              onClick={() => setVisao("historico")}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <Clock size={12} />
              Ver histórico completo
            </button>
          </div>
          <div className="space-y-2">
            {salvosRecentes.map((h) => (
              <div key={h.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.produto_nome}</div>
                  <div className="text-xs text-text-tertiary">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
              </div>
            ))}
            {salvosRecentes.length === 0 && (
              <p className="text-sm text-text-tertiary text-center py-4">Nenhuma precificação salva ainda.</p>
            )}
          </div>
        </Card>

        {modaisExportacao}
        {ConfirmDialog}
      </div>
    );
  }

  return (
    <Card>
      <div className="mb-4">
        <h3 className="font-semibold text-text-primary">Adicione produtos para precificar</h3>
      </div>

      <Table>
        <Thead>
          <tr>
            <Th>SKU</Th>
            <Th>Nome</Th>
            <Th>Loja</Th>
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
          {linhas.map((l) => {
            const loja = lojas.find((lj) => lj.id === l.lojaId);
            const isFaixa = loja?.tipoTaxa === "faixas";
            return (
              <Tr key={l.id}>
                <Td>
                  <input
                    value={l.sku}
                    onChange={(e) => atualizarLinha(l.id, "sku", e.target.value)}
                    className="w-28 bg-transparent text-text-primary outline-none"
                    placeholder="SKU"
                  />
                </Td>
                <Td className="relative">
                  <input
                    value={l.nome}
                    onChange={(e) => atualizarLinha(l.id, "nome", e.target.value)}
                    onFocus={() => setSugestaoAbertaId(l.id)}
                    onBlur={() => setTimeout(() => setSugestaoAbertaId((v) => (v === l.id ? null : v)), 150)}
                    className="w-32 bg-transparent text-text-primary outline-none"
                    placeholder="Nome do produto"
                  />
                  {sugestaoAbertaId === l.id && sugestoesPorNome(l.nome).length > 0 && (
                    <div className="absolute z-10 top-full left-0 mt-1 w-56 bg-surface-1 border border-border rounded-md shadow-lg py-1 text-sm max-h-48 overflow-y-auto">
                      {sugestoesPorNome(l.nome).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => vincularProdutoPorNome(l.id, p)}
                          className="w-full text-left px-3 py-1.5 hover:bg-surface-2 text-text-primary"
                        >
                          {p.sku} — {p.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </Td>
                <Td>
                  <select
                    value={l.lojaId ?? ""}
                    onChange={(e) => atualizarLinha(l.id, "lojaId", e.target.value)}
                    className="w-32 bg-transparent text-text-primary outline-none text-sm"
                  >
                    <option value="">Manual</option>
                    {lojas.map((lj) => (
                      <option key={lj.id} value={lj.id}>
                        {lj.nome}
                      </option>
                    ))}
                  </select>
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
                  {isFaixa ? (
                    <span className="text-xs text-text-tertiary">Automático</span>
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      value={l.comissaoPct}
                      onChange={(e) => atualizarLinha(l.id, "comissaoPct", e.target.value)}
                      className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                    />
                  )}
                </Td>
                <Td align="right">
                  {isFaixa ? (
                    <span className="text-xs text-text-tertiary">Automático</span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={l.taxaFixa}
                      onChange={(e) => atualizarLinha(l.id, "taxaFixa", e.target.value)}
                      className="w-16 bg-transparent text-text-primary text-right outline-none tabular"
                    />
                  )}
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
            );
          })}
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
      {ConfirmDialog}
    </Card>
  );
}
