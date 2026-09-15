"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import {
  produtos as produtosIniciais,
  armazens,
  movimentacoesEstoque,
  precificacoesHistorico,
  formatBRL,
  type Produto,
} from "@/lib/mock-data";

type ProdutoForm = Produto;

const CATEGORIAS = ["Todas", "Perfumaria", "Couro", "Moto & Bike", "Embalagens"] as const;
const STATUS_FILTROS = ["Todos", "Em estoque", "Estoque baixo", "Sem estoque"] as const;

const FORM_VAZIO: ProdutoForm = {
  sku: "",
  nome: "",
  categoria: "Perfumaria",
  fornecedor: "",
  custo: 0,
  precoVenda: 0,
  precoAtacado: null,
  codigoBarras: null,
  estoque: 0,
  estoqueMinimo: 10,
  saidaMediaSemanal: 0,
  armazemId: armazens[0]?.id ?? "",
  imagemUrl: null,
  ativo: true,
};

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>(produtosIniciais);
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]>("Todas");
  const [statusFiltro, setStatusFiltro] = useState<(typeof STATUS_FILTROS)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoSku, setEditandoSku] = useState<string | null>(null);
  const [form, setForm] = useState<ProdutoForm>(FORM_VAZIO);
  const [detalheSku, setDetalheSku] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const filtrados = useMemo(() => {
    return produtos.filter((p) => {
      const passaCategoria = categoria === "Todas" || p.categoria === categoria;
      const passaBusca =
        busca.trim() === "" ||
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.sku.toLowerCase().includes(busca.toLowerCase());
      const passaStatus =
        statusFiltro === "Todos" ||
        (statusFiltro === "Sem estoque" && p.estoque === 0) ||
        (statusFiltro === "Estoque baixo" && p.estoque > 0 && p.estoque <= p.estoqueMinimo) ||
        (statusFiltro === "Em estoque" && p.estoque > p.estoqueMinimo);
      return passaCategoria && passaBusca && passaStatus;
    });
  }, [produtos, categoria, busca, statusFiltro]);

  const valorEmEstoque = produtos.reduce((acc, p) => acc + p.custo * p.estoque, 0);
  const reposicaoNecessaria = produtos.filter((p) => p.estoque <= p.estoqueMinimo).length;

  const todosSelecionadosNaPagina = filtrados.length > 0 && filtrados.every((p) => selecionados.includes(p.sku));

  function alternarSelecaoTodos() {
    if (todosSelecionadosNaPagina) {
      setSelecionados((prev) => prev.filter((sku) => !filtrados.some((p) => p.sku === sku)));
    } else {
      setSelecionados((prev) => Array.from(new Set([...prev, ...filtrados.map((p) => p.sku)])));
    }
  }

  function alternarSelecao(sku: string) {
    setSelecionados((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]));
  }

  function abrirNovo() {
    setEditandoSku(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditandoSku(p.sku);
    setForm({ ...p });
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome.trim() || !form.sku.trim()) return;
    if (editandoSku) {
      setProdutos((prev) => prev.map((p) => (p.sku === editandoSku ? { ...form } : p)));
      toast.success("Produto atualizado");
    } else {
      setProdutos((prev) => [...prev, { ...form }]);
      toast.success("Produto cadastrado");
    }
    setModalAberto(false);
  }

  function remover(sku: string) {
    setProdutos((prev) => prev.filter((p) => p.sku !== sku));
    setSelecionados((prev) => prev.filter((s) => s !== sku));
    toast("Produto removido");
  }

  function alternarAtivo(sku: string) {
    setProdutos((prev) => prev.map((p) => (p.sku === sku ? { ...p, ativo: !p.ativo } : p)));
  }

  function acaoEmMassa(acao: "ativar" | "desativar" | "remover") {
    if (acao === "remover") {
      setProdutos((prev) => prev.filter((p) => !selecionados.includes(p.sku)));
      toast(`${selecionados.length} produto(s) removido(s)`);
    } else {
      setProdutos((prev) =>
        prev.map((p) => (selecionados.includes(p.sku) ? { ...p, ativo: acao === "ativar" } : p)),
      );
      toast.success(`${selecionados.length} produto(s) ${acao === "ativar" ? "ativado(s)" : "desativado(s)"}`);
    }
    setSelecionados([]);
  }

  const produtoDetalhe = produtos.find((p) => p.sku === detalheSku) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Produtos"
        title="Produtos & Inventário"
        actions={
          <>
            <Button variant="secondary">Exportar CSV</Button>
            <Button variant="primary" onClick={abrirNovo}>+ Cadastrar Produto</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Total de Produtos</CardEyebrow>
          <HeroMetric value={String(produtos.length)} accent />
        </Card>
        <Card>
          <CardEyebrow>Valor em Estoque</CardEyebrow>
          <HeroMetric value={formatBRL(valorEmEstoque)} />
        </Card>
        <Card>
          <CardEyebrow>Reposição Necessária</CardEyebrow>
          <HeroMetric value={String(reposicaoNecessaria)} caption="produtos no mínimo ou abaixo" />
        </Card>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou SKU…"
          className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent w-full sm:w-64"
        />
        <div className="flex gap-2 flex-wrap">
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                categoria === c
                  ? "bg-accent-soft border-accent-soft text-accent font-medium"
                  : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTROS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFiltro(s)}
            className={`h-7 px-2.5 rounded-full text-xs border transition-colors ${
              statusFiltro === s
                ? "bg-surface-3 border-border text-text-primary font-medium"
                : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {selecionados.length > 0 && (
        <div className="flex items-center justify-between bg-accent-soft border border-accent-soft rounded-md px-4 py-2.5 mb-3">
          <span className="text-sm text-accent font-medium">{selecionados.length} selecionado(s)</span>
          <div className="flex gap-4">
            <button onClick={() => acaoEmMassa("ativar")} className="text-sm text-text-secondary hover:text-text-primary">
              Ativar
            </button>
            <button onClick={() => acaoEmMassa("desativar")} className="text-sm text-text-secondary hover:text-text-primary">
              Desativar
            </button>
            <button onClick={() => acaoEmMassa("remover")} className="text-sm text-negative hover:underline">
              Remover
            </button>
          </div>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState icon={PackageSearch} title="Nenhum produto encontrado" description="Ajuste a busca ou os filtros para ver resultados." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>
                  <input type="checkbox" checked={todosSelecionadosNaPagina} onChange={alternarSelecaoTodos} className="w-4 h-4 accent-accent" />
                </Th>
                <Th></Th>
                <Th>Produto</Th>
                <Th>Armazém</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Venda</Th>
                <Th align="right">Atacado</Th>
                <Th align="right">Estoque</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {filtrados.map((p) => {
                const armazem = armazens.find((a) => a.id === p.armazemId);
                return (
                  <Tr key={p.sku}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(p.sku)}
                        onChange={() => alternarSelecao(p.sku)}
                        className="w-4 h-4 accent-accent"
                      />
                    </Td>
                    <Td className="cursor-pointer" onClick={() => setDetalheSku(p.sku)}>
                      <ProductThumb src={p.imagemUrl} sku={p.sku} />
                    </Td>
                    <Td className="cursor-pointer" onClick={() => setDetalheSku(p.sku)}>
                      <div className={p.ativo ? "text-text-primary font-medium" : "text-text-tertiary line-through"}>
                        {p.nome}
                      </div>
                      <div className="text-xs text-text-tertiary">
                        {p.categoria} · {p.fornecedor}
                      </div>
                    </Td>
                    <Td className="text-text-secondary">{armazem?.nome ?? "—"}</Td>
                    <Td align="right" mono>
                      {formatBRL(p.custo)}
                    </Td>
                    <Td align="right" mono className="text-accent">
                      {formatBRL(p.precoVenda)}
                    </Td>
                    <Td align="right" mono className="text-text-secondary">
                      {p.precoAtacado ? formatBRL(p.precoAtacado) : "—"}
                    </Td>
                    <Td align="right" mono>
                      {p.estoque}
                    </Td>
                    <Td>
                      <StatusChip label={p.ativo ? "Ativo" : "Inativo"} tone={p.ativo ? "positive" : "neutral"} />
                    </Td>
                    <Td align="right">
                      <RowMenu
                        actions={[
                          { label: "Ver resumo", onClick: () => setDetalheSku(p.sku) },
                          { label: "Editar", onClick: () => abrirEdicao(p) },
                          { label: p.ativo ? "Desativar" : "Ativar", onClick: () => alternarAtivo(p.sku) },
                          { label: "Remover", onClick: () => remover(p.sku), destructive: true },
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

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editandoSku ? "Editar Produto" : "Cadastrar Produto"}>
        <FormField label="SKU">
          <input
            className={inputClass}
            value={form.sku}
            disabled={!!editandoSku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </FormField>
        <FormField label="Nome do Produto">
          <input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </FormField>
        <FormField label="URL da Imagem (opcional)">
          <input
            className={inputClass}
            value={form.imagemUrl ?? ""}
            onChange={(e) => setForm({ ...form, imagemUrl: e.target.value || null })}
            placeholder="https://…"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Categoria">
            <select className={inputClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.filter((c) => c !== "Todas").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Armazém">
            <select className={inputClass} value={form.armazemId} onChange={(e) => setForm({ ...form, armazemId: e.target.value })}>
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Fornecedor">
          <input className={inputClass} value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Custo (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.custo}
              onChange={(e) => setForm({ ...form, custo: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Preço Venda (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.precoVenda}
              onChange={(e) => setForm({ ...form, precoVenda: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Preço Atacado (R$)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.precoAtacado ?? ""}
              placeholder="Opcional"
              onChange={(e) => setForm({ ...form, precoAtacado: e.target.value ? Number(e.target.value) : null })}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Estoque Atual">
            <input
              type="number"
              className={inputClass}
              value={form.estoque}
              onChange={(e) => setForm({ ...form, estoque: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Estoque Mínimo (alerta)">
            <input
              type="number"
              className={inputClass}
              value={form.estoqueMinimo}
              onChange={(e) => setForm({ ...form, estoqueMinimo: Number(e.target.value) || 0 })}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Saída Média Semanal">
            <input
              type="number"
              className={inputClass}
              value={form.saidaMediaSemanal}
              onChange={(e) => setForm({ ...form, saidaMediaSemanal: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Código de Barras (opcional)">
            <input
              className={inputClass}
              value={form.codigoBarras ?? ""}
              placeholder="EAN/GTIN"
              onChange={(e) => setForm({ ...form, codigoBarras: e.target.value || null })}
            />
          </FormField>
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={() => setModalAberto(false)}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar}>
            Salvar
          </Button>
        </div>
      </Modal>

      <Modal open={!!produtoDetalhe} onClose={() => setDetalheSku(null)} title={produtoDetalhe?.nome ?? ""} width="max-w-2xl">
        {produtoDetalhe && <ProdutoResumo produto={produtoDetalhe} />}
      </Modal>
    </>
  );
}

function ProdutoResumo({ produto }: { produto: Produto }) {
  const armazem = armazens.find((a) => a.id === produto.armazemId);
  const valorEstoque = produto.custo * produto.estoque;
  const movimentacoes = movimentacoesEstoque.filter((m) => m.sku === produto.sku);
  const precificacoes = precificacoesHistorico.filter((h) => h.produto === produto.nome);
  const abaixoDoMinimo = produto.estoque <= produto.estoqueMinimo;
  const sugestaoCompra = Math.max(0, Math.ceil(produto.saidaMediaSemanal * 4) - produto.estoque);
  const margemPct = produto.precoVenda > 0 ? ((produto.precoVenda - produto.custo) / produto.precoVenda) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProductThumb src={produto.imagemUrl} sku={produto.sku} size={56} />
        <div className="flex-1">
          <div className="text-xs text-text-tertiary">{produto.categoria} · {produto.fornecedor}</div>
          <div className="text-xs text-text-tertiary">Armazém: {armazem?.nome ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Estoque Atual</div>
          <div className="font-mono text-lg text-text-primary">{produto.estoque} un.</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Valor em Estoque</div>
          <div className="font-mono text-lg text-text-primary">{formatBRL(valorEstoque)}</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Preço Venda</div>
          <div className="font-mono text-lg text-accent">{formatBRL(produto.precoVenda)}</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Margem</div>
          <div className="font-mono text-lg text-positive">{margemPct.toFixed(1)}%</div>
        </div>
      </div>

      {abaixoDoMinimo && (
        <div className="bg-negative-soft border border-negative/20 rounded-md p-3 flex items-center justify-between">
          <div className="text-sm text-negative">
            Estoque no mínimo ({produto.estoqueMinimo} un.) — saída média de {produto.saidaMediaSemanal} un./semana.
          </div>
          {sugestaoCompra > 0 && (
            <span className="text-sm font-medium text-negative shrink-0 ml-3">Sugestão: comprar {sugestaoCompra} un.</span>
          )}
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Movimentações Recentes</h4>
        {movimentacoes.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma movimentação registrada para este produto.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {movimentacoes.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{m.motivo}</div>
                  <div className="text-xs text-text-tertiary">{m.data}</div>
                </div>
                <span className={`font-mono ${m.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                  {m.tipo === "entrada" ? "+" : "-"}
                  {m.quantidade} un
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Histórico de Precificação</h4>
        {precificacoes.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma precificação salva para este produto ainda.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {precificacoes.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.canal}</div>
                  <div className="text-xs text-text-tertiary">{h.data}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
