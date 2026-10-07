"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { Chip } from "@/components/ui/Chip";
import { formatBRL, classeValor, formatarData } from "@/lib/format";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { tabelaEmMassa } from "@/lib/precificacao-exportar";
import {
  MAX_LINHAS_MASSA,
  calcularResultadosEmMassa,
  linhaVazia,
  taxasDaLinha,
  type LinhaEmMassa,
  type LojaMassa,
  type ProdutoMassa,
} from "@/lib/precificacao-massa";
import { useExportarPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import { TabelaEntradaMassa } from "@/components/precificacao/massa/TabelaEntradaMassa";
import { DetalheLinhaMassa, resumoDeResultadoEmMassa } from "@/components/precificacao/massa/DetalheLinhaMassa";
import { salvarPrecificacoesEmMassa } from "@/app/(painel)/precificacao/actions";
import type { PrecificacaoHist } from "@/lib/precificacao-estado";
import { executarComToast } from "@/lib/acao-cliente";

export function CalculadoraEmMassa({
  produtos,
  lojas,
  historico,
  setVisao,
  empresa = null,
}: {
  empresa?: { nome: string | null; logoUrl: string | null } | null;
  produtos: ProdutoMassa[];
  lojas: LojaMassa[];
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
  const [exportando, setExportando] = useState(false);
  const salvosRecentes = useMemo(() => historico.filter((h) => h.origem === "em_massa").slice(0, 5), [historico]);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao(empresa);

  function sugestoesPorNome(nome: string) {
    const q = nome.trim().toLowerCase();
    if (!q) return [];
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 6);
  }

  function vincularProdutoPorNome(id: string, produto: ProdutoMassa) {
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
          const comissaoDaLoja = loja && !(loja.tipoTaxa === "faixas" && loja.faixas.length > 0);
          return {
            ...l,
            lojaId: valor || null,
            comissaoPct: comissaoDaLoja ? loja.comissaoPct : l.comissaoPct,
            taxaFixa: comissaoDaLoja ? loja.taxaFixa : l.taxaFixa,
          };
        }
        return { ...l, [campo]: Number(valor) || 0 };
      }),
    );
  }

  function adicionarLinha() {
    if (linhas.length >= MAX_LINHAS_MASSA) {
      toast.error(`No máximo ${MAX_LINHAS_MASSA} linhas por vez.`);
      return;
    }
    setLinhas((prev) => [...prev, linhaVazia()]);
  }

  function removerLinha(id: string) {
    setLinhas((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : [linhaVazia()]));
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

  const resultados = useMemo(() => calcularResultadosEmMassa(linhas, lojas), [linhas, lojas]);

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

  function salvarNoHistorico() {
    startTransition(async () => {
      // Um INSERT só, em vez de uma Server Action por linha. E o erro é mostrado inteiro:
      // o `catch { falhas += 1 }` de antes engolia a mensagem, e o usuário via "12 linha(s)
      // falharam" sem nunca descobrir o motivo.
      const salvas = await executarComToast(
        salvarPrecificacoesEmMassa(
          resultados.map((r) => {
            const { taxaVariavelPct, taxaFixa } = taxasDaLinha(r);
            return {
              produto_id: r.linha.produtoId,
              produto_nome: r.linha.nome || r.linha.sku,
              canal: r.loja ? `${r.loja.canalNome} — ${r.loja.nome}` : null,
              titulo_anuncio: null,
              loja_id: r.loja?.id ?? null,
              componentes: null,
              taxa_extra_valor: r.loja?.taxaExtraValor ?? null,
              taxa_extra_tipo: r.loja?.taxaExtraTipo ?? null,
              custo: r.linha.custo,
              taxa_variavel_pct: taxaVariavelPct,
              taxa_fixa: taxaFixa,
              taxa_adicional_pct: 0,
              imposto_pct: r.linha.impostoPct / 100,
              margem_pct: r.linha.margemPct / 100,
              preco_calculado: r.resultado.precoVenda,
              lucro: r.resultado.lucroLiquido,
              origem: "em_massa" as const,
            };
          }),
        ),
        // Sem `sucesso`: a contagem só existe depois da resposta.
        { erro: "Erro ao salvar as precificações" },
      );
      if (salvas.ok) toast.success(`${salvas.dado} precificação(ões) salva(s) no histórico`);
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

        <div className="flex gap-2 flex-wrap">
          {(
            [
              { id: "todos" as const, label: `Todos (${resultados.length})` },
              { id: "subir" as const, label: `Subir preço (${itensSubirPreco.length})` },
              { id: "ok" as const, label: `OK (${itensOk.length})` },
            ]
          ).map((f) => (
            <Chip key={f.id} onClick={() => setFiltroResultado(f.id)} ativo={filtroResultado === f.id}>
              {f.label}
            </Chip>
          ))}
        </div>

        <Card padding="nenhum" className="overflow-hidden">
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
                          aria-label={expandida ? "Recolher detalhes" : "Ver detalhes"}
                        >
                          {expandida ? "▲" : "▾"}
                        </button>
                      </Td>
                    </Tr>
                    {expandida && (
                      <tr>
                        <td colSpan={8} className="bg-surface-2/40 px-5 py-4">
                          <DetalheLinhaMassa
                            r={r}
                            onCopiar={() => setPendenteExport({ acao: "copiar", dados: resumoDeResultadoEmMassa(r) })}
                            onWhatsapp={() => setPendenteExport({ acao: "whatsapp", dados: resumoDeResultadoEmMassa(r) })}
                            onImagem={() => setPendenteImagem(resumoDeResultadoEmMassa(r))}
                          />
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
            <Button variant="secondary" onClick={() => setExportando(true)}>
              <Download size={14} /> Exportar
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
                  <div className="text-xs text-text-tertiary">{formatarData(h.criado_em)}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
              </div>
            ))}
            {salvosRecentes.length === 0 && (
              <p className="text-sm text-text-tertiary text-center py-4">Nenhuma precificação salva ainda.</p>
            )}
          </div>
        </Card>

        {exportando && (
        <ExportarModal
          aberto
          onClose={() => setExportando(false)}
          titulo="Exportar precificação em massa"
          escopos={[
            { id: "todos", rotulo: "Todas as linhas", quantidade: resultados.length },
            { id: "subir", rotulo: "Precisam subir o preço", quantidade: resultados.filter((r) => r.precisaSubir).length },
          ]}
          montar={(escopo) => {
            const lista = escopo === "subir" ? resultados.filter((r) => r.precisaSubir) : resultados;
            return tabelaEmMassa(lista, `${lista.length} produto(s)`);
          }}
          empresa={empresa}
        />
      )}
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

      <TabelaEntradaMassa
        linhas={linhas}
        lojas={lojas}
        sugestaoAbertaId={sugestaoAbertaId}
        onSugestaoAberta={setSugestaoAbertaId}
        sugestoesPorNome={sugestoesPorNome}
        onVincularProduto={vincularProdutoPorNome}
        onAtualizar={atualizarLinha}
        onRemover={removerLinha}
      />

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-4">
          <button onClick={adicionarLinha} className="text-sm text-accent hover:underline">
            + Adicionar linha
          </button>
          <button onClick={limparTabela} className="text-sm text-text-tertiary hover:text-negative">
            Limpar tabela
          </button>
        </div>
        <span className="text-xs text-text-tertiary">
          {linhas.length} / {MAX_LINHAS_MASSA} linhas
        </span>
      </div>

      <Button variant="primary" className="w-full mt-4" onClick={calcularTodos}>
        Calcular Todos
      </Button>
      {ConfirmDialog}
    </Card>
  );
}
