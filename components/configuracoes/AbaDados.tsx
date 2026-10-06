"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, ShoppingCart, ArrowLeftRight, Receipt, Wallet, DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Modal, FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { ImportarPedidosModal } from "@/components/compras/ImportarPedidosModal";
import { executar, type Resultado } from "@/lib/acao";
import { baixarBlob } from "@/lib/exportar-arquivos";
import { formatarDataHora, hojeIsoLocal } from "@/lib/format";
import type { TabelaExport } from "@/lib/exportar";
import {
  backupCompleto,
  carregarFinanceiroExportacao,
  carregarMovimentacoesExportacao,
  carregarOpcoesImportacaoPedidos,
  carregarProdutosExportacao,
  carregarSaldosExportacao,
  carregarVendasExportacao,
} from "@/app/(painel)/configuracoes/dados-actions";

type Produto = Awaited<ReturnType<typeof carregarProdutosExportacao>> extends Resultado<(infer T)[]> ? T : never;
type OpcoesImportacao = Awaited<ReturnType<typeof carregarOpcoesImportacaoPedidos>> extends Resultado<infer T> ? T : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada seção monta a sua tabela
type TabelaQualquer = TabelaExport<any>;

function Secao({ icone: Icone, titulo, descricao, children }: { icone: typeof Boxes; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <Icone size={17} />
        </span>
        <div className="flex-1 min-w-0">
          <CardTitle>{titulo}</CardTitle>
          <p className="text-xs text-text-tertiary mb-3">{descricao}</p>
          <div className="flex flex-wrap items-end gap-2">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function inicioDoMes() {
  const d = new Date();
  return hojeIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Configurações → Dados: importar e exportar num lugar só. Cada exportação busca os dados
 * no clique e abre o modal padrão (xlsx, PDF, imagem, CSV).
 */
export function AbaDados({ armazens }: { armazens: { id: string; nome: string }[] }) {
  const [carregando, setCarregando] = useState<string | null>(null);
  const [tabela, setTabela] = useState<TabelaQualquer | null>(null);
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [importacao, setImportacao] = useState<OpcoesImportacao | null>(null);
  const [de, setDe] = useState(inicioDoMes);
  const [ate, setAte] = useState(() => hojeIsoLocal());
  const [armazemId, setArmazemId] = useState("");

  async function carregar<T>(chave: string, fn: () => Promise<Resultado<T>>): Promise<T | null> {
    setCarregando(chave);
    try {
      return await executar(fn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar os dados");
      return null;
    } finally {
      setCarregando(null);
    }
  }

  const periodo = { de: de || null, ate: ate || null, armazemId: null };
  const textoPeriodo = [de && `de ${de.split("-").reverse().join("/")}`, ate && `até ${ate.split("-").reverse().join("/")}`].filter(Boolean).join(" ");

  async function exportarSaldos() {
    const linhas = await carregar("saldos", carregarSaldosExportacao);
    if (!linhas) return;
    setTabela({
      titulo: "Saldo por armazém",
      colunas: [
        { rotulo: "Armazém", largura: 18, valor: (l) => l.armazem },
        { rotulo: "SKU", valor: (l) => l.sku },
        { rotulo: "Produto", largura: 36, valor: (l) => l.nome },
        { rotulo: "Quantidade", tipo: "inteiro", valor: (l) => l.quantidade },
        { rotulo: "Custo", tipo: "moeda", valor: (l) => l.custo },
        { rotulo: "Valor", tipo: "moeda", valor: (l) => l.quantidade * l.custo },
      ],
      linhas,
      total: ["Total", null, null, linhas.reduce((s, l) => s + l.quantidade, 0), null, linhas.reduce((s, l) => s + l.quantidade * l.custo, 0)],
    });
  }

  async function exportarMovimentacoes() {
    const linhas = await carregar("movs", () => carregarMovimentacoesExportacao({ ...periodo, armazemId: armazemId || null }));
    if (!linhas) return;
    setTabela({
      titulo: "Entradas e saídas de estoque",
      subtitulo: [textoPeriodo, armazemId ? armazens.find((a) => a.id === armazemId)?.nome : null].filter(Boolean).join(" · ") || undefined,
      colunas: [
        { rotulo: "Data", largura: 18, valor: (l) => formatarDataHora(l.data) },
        { rotulo: "Tipo", valor: (l) => l.tipo },
        { rotulo: "Produto", largura: 34, valor: (l) => l.produto },
        { rotulo: "Quantidade", tipo: "inteiro", valor: (l) => l.quantidade },
        { rotulo: "Custo unit.", tipo: "moeda", valor: (l) => l.custo_unitario },
        { rotulo: "Armazém", valor: (l) => l.armazem },
        { rotulo: "Destino", valor: (l) => l.destino },
        { rotulo: "Motivo", largura: 28, valor: (l) => l.motivo },
      ],
      linhas,
    });
  }

  async function exportarVendas() {
    const linhas = await carregar("vendas", () => carregarVendasExportacao(periodo));
    if (!linhas) return;
    setTabela({
      titulo: "Vendas (itens)",
      subtitulo: textoPeriodo || undefined,
      colunas: [
        { rotulo: "Venda", valor: (l) => l.numero },
        { rotulo: "Data", largura: 18, valor: (l) => formatarDataHora(l.data) },
        { rotulo: "Cliente", largura: 20, valor: (l) => l.cliente },
        { rotulo: "Situação", valor: (l) => l.status },
        { rotulo: "Pagamento", valor: (l) => l.pagamento },
        { rotulo: "SKU", valor: (l) => l.sku },
        { rotulo: "Produto", largura: 30, valor: (l) => l.produto },
        { rotulo: "Qtd", tipo: "inteiro", valor: (l) => l.quantidade },
        { rotulo: "Preço", tipo: "moeda", valor: (l) => l.preco },
        { rotulo: "Custo", tipo: "moeda", valor: (l) => l.custo },
        { rotulo: "Lucro do item", tipo: "moeda", valor: (l) => (l.preco - l.custo) * l.quantidade },
      ],
      linhas,
    });
  }

  async function exportarFinanceiro() {
    const linhas = await carregar("financeiro", () => carregarFinanceiroExportacao(periodo));
    if (!linhas) return;
    setTabela({
      titulo: "Contas a pagar e a receber",
      subtitulo: textoPeriodo ? `Vencimento ${textoPeriodo}` : undefined,
      colunas: [
        { rotulo: "Tipo", valor: (l) => l.tipo },
        { rotulo: "Descrição", largura: 36, valor: (l) => l.descricao },
        { rotulo: "Vencimento", tipo: "data", valor: (l) => l.vencimento },
        { rotulo: "Valor", tipo: "moeda", valor: (l) => l.valor },
        { rotulo: "Situação", valor: (l) => l.status },
        { rotulo: "Conta", valor: (l) => l.conta },
      ],
      linhas,
    });
  }

  async function baixarBackup() {
    const dados = await carregar("backup", backupCompleto);
    if (!dados) return;
    baixarBlob(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }), `sertao-backup-${hojeIsoLocal()}.json`);
    toast.success("Backup completo baixado");
  }

  const campoPeriodo = (
    <>
      <FormField label="De">
        <input type="date" className={`${campoBase} w-40`} value={de} onChange={(e) => setDe(e.target.value)} />
      </FormField>
      <FormField label="Até">
        <input type="date" className={`${campoBase} w-40`} value={ate} onChange={(e) => setAte(e.target.value)} />
      </FormField>
    </>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">Importe e exporte os dados do sistema em Excel (.xlsx), PDF, imagem ou CSV.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Secao icone={Boxes} titulo="Estoque" descricao="Lista de produtos (todos ou os que você escolher) e o saldo de cada armazém.">
          <Button variant="secondary" loading={carregando === "produtos"} onClick={async () => setProdutos(await carregar("produtos", carregarProdutosExportacao))}>
            Exportar produtos
          </Button>
          <Button variant="secondary" loading={carregando === "saldos"} onClick={exportarSaldos}>
            Saldo por armazém
          </Button>
        </Secao>

        <Secao icone={ShoppingCart} titulo="Compras" descricao="Importe pedidos de compra de uma planilha, com o nosso modelo. Para exportar, use Compras (selecionados ou todos).">
          <Button variant="secondary" loading={carregando === "importar"} onClick={async () => setImportacao(await carregar("importar", carregarOpcoesImportacaoPedidos))}>
            Importar pedidos de compra
          </Button>
          <a href="/compras" className="text-sm text-accent hover:underline h-9 inline-flex items-center px-1">
            Exportar em Compras ›
          </a>
        </Secao>

        <Secao icone={ArrowLeftRight} titulo="Entradas e saídas" descricao="Movimentações de estoque do período, por armazém.">
          {campoPeriodo}
          <FormField label="Armazém">
            <select className={`${campoBase} w-40`} value={armazemId} onChange={(e) => setArmazemId(e.target.value)}>
              <option value="">Todos</option>
              {armazens.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </FormField>
          <div className="mb-4">
            <Button variant="secondary" loading={carregando === "movs"} onClick={exportarMovimentacoes}>
              Exportar
            </Button>
          </div>
        </Secao>

        <Secao icone={Receipt} titulo="Vendas" descricao="Vendas do período, item a item, com custo e lucro.">
          {campoPeriodo}
          <div className="mb-4">
            <Button variant="secondary" loading={carregando === "vendas"} onClick={exportarVendas}>
              Exportar
            </Button>
          </div>
        </Secao>

        <Secao icone={Wallet} titulo="Financeiro" descricao="Contas a pagar e a receber com vencimento no período.">
          {campoPeriodo}
          <div className="mb-4">
            <Button variant="secondary" loading={carregando === "financeiro"} onClick={exportarFinanceiro}>
              Exportar
            </Button>
          </div>
        </Secao>

        <Secao icone={DatabaseBackup} titulo="Backup completo" descricao="Tudo o que você cadastrou, tabela por tabela, num arquivo JSON. Guarde em lugar seguro.">
          <Button variant="secondary" loading={carregando === "backup"} onClick={baixarBackup}>
            Baixar backup
          </Button>
        </Secao>
      </div>

      {produtos && <SeletorProdutos produtos={produtos} onClose={() => setProdutos(null)} onContinuar={(t) => { setProdutos(null); setTabela(t); }} />}
      {tabela && <ExportarModal aberto onClose={() => setTabela(null)} titulo={`Exportar: ${tabela.titulo}`} escopos={[{ id: "todos", rotulo: "Tudo", quantidade: tabela.linhas.length }]} montar={() => tabela} />}
      {importacao && (
        <ImportarPedidosModal
          onClose={() => setImportacao(null)}
          produtos={importacao.produtos}
          fornecedores={importacao.fornecedores}
          armazens={importacao.armazens}
          contas={importacao.contas}
          formasPagamento={importacao.formasPagamento}
        />
      )}
    </div>
  );
}

/** "Selecionar tudo ou eu escolho": busca e caixas de seleção antes de exportar. */
function SeletorProdutos({ produtos, onClose, onContinuar }: { produtos: Produto[]; onClose: () => void; onContinuar: (t: TabelaQualquer) => void }) {
  const [modo, setModo] = useState<"todos" | "escolher">("todos");
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos.filter((p) => !t || p.nome.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t));
  }, [produtos, busca]);

  function continuar() {
    const linhas = modo === "todos" ? produtos : produtos.filter((p) => escolhidos.has(p.id));
    if (linhas.length === 0) return toast.error("Escolha pelo menos um produto.");
    onContinuar({
      titulo: "Produtos",
      subtitulo: modo === "escolher" ? `${linhas.length} escolhido(s)` : undefined,
      colunas: [
        { rotulo: "SKU", largura: 16, valor: (p: Produto) => p.sku },
        { rotulo: "Produto", largura: 36, valor: (p: Produto) => p.nome },
        { rotulo: "Categoria", valor: (p: Produto) => p.categoria },
        { rotulo: "Fornecedor", valor: (p: Produto) => p.fornecedor },
        { rotulo: "Armazém", valor: (p: Produto) => p.armazem },
        { rotulo: "Custo", tipo: "moeda", valor: (p: Produto) => p.custo },
        { rotulo: "Preço varejo", tipo: "moeda", valor: (p: Produto) => p.preco_venda },
        { rotulo: "Preço atacado", tipo: "moeda", valor: (p: Produto) => p.preco_atacado },
        { rotulo: "Estoque", tipo: "inteiro", valor: (p: Produto) => p.estoque },
        { rotulo: "Mínimo", tipo: "inteiro", valor: (p: Produto) => p.estoque_minimo },
        { rotulo: "Código de barras", valor: (p: Produto) => p.codigo_barras },
        { rotulo: "Peso (g)", tipo: "inteiro", valor: (p: Produto) => p.peso_g },
        { rotulo: "Ativo", valor: (p: Produto) => (p.ativo ? "Sim" : "Não") },
      ],
      linhas,
    });
  }

  return (
    <Modal open onClose={onClose} title="Quais produtos exportar?" width="max-w-lg">
      <div className="flex gap-2 mb-3">
        {(
          [
            ["todos", `Todos (${produtos.length})`],
            ["escolher", "Eu escolho"],
          ] as const
        ).map(([v, r]) => (
          <button
            key={v}
            type="button"
            onClick={() => setModo(v)}
            className={`flex-1 h-9 rounded-md border text-sm ${modo === v ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
          >
            {r}
          </button>
        ))}
      </div>
      {modo === "escolher" && (
        <>
          <input className={`${inputClass} mb-2`} placeholder="Buscar por nome ou SKU…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="flex justify-between text-xs mb-1">
            <button type="button" className="text-accent hover:underline" onClick={() => setEscolhidos(new Set([...escolhidos, ...visiveis.map((p) => p.id)]))}>
              Marcar os {visiveis.length} da lista
            </button>
            <span className="text-text-tertiary">{escolhidos.size} escolhido(s)</span>
          </div>
          <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border mb-3">
            {visiveis.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-accent"
                  checked={escolhidos.has(p.id)}
                  onChange={() =>
                    setEscolhidos((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                />
                <span className="flex-1 min-w-0 truncate text-text-primary">{p.nome}</span>
                <span className="font-mono text-xs text-text-tertiary">{p.sku}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={continuar}>
          Continuar
        </Button>
      </div>
    </Modal>
  );
}
