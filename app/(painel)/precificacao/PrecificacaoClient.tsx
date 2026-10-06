"use client";

import { useMemo, useState, useTransition } from "react";
import { executarComToast } from "@/lib/acao-cliente";
import { carregarHistoricoPrecificacoes } from "./actions";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { Download, History } from "lucide-react";
import { ExportarPrecificacoesModal } from "@/components/precificacao/ExportarPrecificacoes";
import { formatBRL } from "@/lib/format";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";
import { VariacoesView } from "@/components/precificacao/VariacoesView";
import { KitsView } from "@/components/precificacao/KitsView";
import { PainelEntradas } from "@/components/precificacao/PainelEntradas";
import { PainelTaxas } from "@/components/precificacao/PainelTaxas";
import { PainelModo } from "@/components/precificacao/PainelModo";
import { PainelConcorrentes } from "@/components/precificacao/PainelConcorrentes";
import { PainelResultado } from "@/components/precificacao/PainelResultado";
import { PainelEstrategiaVixe } from "@/components/precificacao/PainelEstrategiaVixe";
import { PainelAnuncio } from "@/components/precificacao/PainelAnuncio";
import { HistoricoPrecificacoes } from "@/components/precificacao/HistoricoPrecificacoes";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import {
  usePrecificacao,
  type PrecificacaoHist,
  type LojaOpcao,
  type AnuncioSalvo,
  type ProdutoOpcao,
} from "@/lib/precificacao-estado";
import type { Concorrente } from "@/lib/pricing";

export type { PrecificacaoHist, LojaOpcao, AnuncioSalvo, ProdutoOpcao, VariacaoSalva } from "@/lib/precificacao-estado";

/** Quantas linhas do histórico a página traz e cada "Carregar mais" acrescenta. */
const POR_PAGINA = 50;

const ABAS_PRECIFICACAO = [
  { value: "individual", label: "Individual" },
  { value: "variacoes", label: "Variações" },
  { value: "kits", label: "Kits" },
  { value: "massa", label: "Em Massa" },
  { value: "historico", label: "Histórico" },
] as const satisfies readonly TabItem<"individual" | "variacoes" | "kits" | "massa" | "historico">[];

/**
 * Calculadora de Precificação.
 *
 * O estado e os cálculos moram em `lib/precificacao-estado.ts` (hook `usePrecificacao`);
 * cada seção visual virou um componente em `components/precificacao/Painel*.tsx`. Este
 * arquivo só monta as abas e passa o `estado` adiante — era 1.575 linhas antes da divisão.
 */
export function PrecificacaoClient({
  historico,
  produtos,
  aliquotaDasPadrao,
  lojas,
  anuncios,
  concorrentesPorProduto,
  iaDisponivel,
  empresa,
}: {
  empresa: { nome: string | null; logoUrl: string | null } | null;
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const [exportandoSalvas, setExportandoSalvas] = useState(false);
  // Linhas mais antigas buscadas sob demanda (a página traz só as 50 mais recentes).
  const [maisAntigas, setMaisAntigas] = useState<PrecificacaoHist[]>([]);
  const [temMais, setTemMais] = useState(historico.length >= POR_PAGINA);
  const [carregandoMais, startCarregar] = useTransition();
  // Depois de salvar, o servidor manda as 50 de novo: o que já estava na tela não duplica.
  const historicoCompleto = useMemo(() => {
    const ids = new Set(historico.map((h) => h.id));
    return [...historico, ...maisAntigas.filter((h) => !ids.has(h.id))];
  }, [historico, maisAntigas]);
  const estado = usePrecificacao({ historico: historicoCompleto, produtos, aliquotaDasPadrao, lojas, anuncios, concorrentesPorProduto, empresa });

  function carregarMais(tudo: boolean) {
    const ultima = historicoCompleto[historicoCompleto.length - 1];
    startCarregar(async () => {
      const limite = tudo ? 5000 : POR_PAGINA;
      const r = await executarComToast(carregarHistoricoPrecificacoes(ultima?.criado_em ?? null, limite), { erro: "Erro ao carregar o histórico" });
      if (!r.ok) return;
      setMaisAntigas((x) => [...x, ...r.dado]);
      setTemMais(r.dado.length >= limite);
    });
  }
  const { visao, setVisao } = estado;

  function acoesLigarProduto(h: PrecificacaoHist) {
    return [
      { label: "Vincular a um produto", onClick: () => estado.abrirVincular(h) },
      ...(h.produto_id ? [{ label: "Aplicar preço ao produto", onClick: () => estado.aplicarPrecoDoHistorico(h) }] : []),
      { label: "Criar produto a partir desta precificação", onClick: () => estado.criarProdutoDoHistorico(h) },
    ];
  }

  return (
    <>
      <PageHeader title="Calculadora de Precificação" />

      {/* Estas quatro abas eram <button> cru: sem indicador, sem ARIA e sem teclado —
          na tela mais importante do produto, enquanto Admin e Configurações já usavam
          o <Tabs>. Duas telas do mesmo app navegavam de jeitos visualmente diferentes. */}
      <Tabs tabs={ABAS_PRECIFICACAO} value={visao} onChange={setVisao} className="mb-5" />

      {visao === "massa" && <CalculadoraEmMassa produtos={produtos} lojas={lojas} historico={historico} setVisao={setVisao} empresa={empresa} />}

      {visao === "kits" && <KitsView produtos={produtos} lojas={lojas} aliquotaDasPadrao={aliquotaDasPadrao} />}

      {visao === "variacoes" && (
        <VariacoesView
          produtos={produtos}
          lojas={lojas}
          anuncios={anuncios}
          aliquotaDasPadrao={aliquotaDasPadrao}
          confirm={estado.confirm}
          setVisao={setVisao}
          iaDisponivel={iaDisponivel}
          empresa={empresa}
        />
      )}

      {visao === "individual" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <PainelEntradas estado={estado} produtos={produtos} iaDisponivel={iaDisponivel} />
              <PainelTaxas estado={estado} lojas={lojas} iaDisponivel={iaDisponivel} />
              <PainelModo estado={estado} />
              <PainelConcorrentes estado={estado} />
            </div>

            <div className="space-y-5">
              <PainelResultado estado={estado} produtoVinculado={estado.produtoVinculado} lojas={lojas} />
              <PainelEstrategiaVixe estado={estado} iaDisponivel={iaDisponivel} />
              <PainelAnuncio estado={estado} />
            </div>
          </div>

          <Card className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-text-primary">Precificações Salvas</h2>
              <div className="flex items-center gap-3">
                {/* Exporta as mesmas que o cartão lista (as individuais); antes levava também as em massa. */}
                <Button variant="secondary" size="sm" onClick={() => setExportandoSalvas(true)} disabled={!historico.some((h) => h.origem === "individual")}>
                  <Download size={14} /> Exportar
                </Button>
                <IconButton onClick={() => setVisao("historico")} aria-label="Ver histórico completo" title="Ver histórico completo">
                  <History size={14} />
                </IconButton>
              </div>
            </div>
            <div className="space-y-2">
              {historico
                .filter((h) => h.origem === "individual")
                .slice(0, 5)
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                    <div>
                      <div className="text-text-primary">{h.produto_nome}</div>
                      <div className="text-xs text-text-tertiary">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
                      <RowMenu actions={acoesLigarProduto(h)} />
                    </div>
                  </div>
                ))}
              {historico.filter((h) => h.origem === "individual").length === 0 && (
                <p className="text-sm text-text-tertiary text-center py-4">Nenhuma precificação salva ainda.</p>
              )}
            </div>
          </Card>
        </>
      )}

      {visao === "historico" && (
        <HistoricoPrecificacoes
          estado={estado}
          anuncios={anuncios}
          acoesLigarProduto={acoesLigarProduto}
          empresa={empresa}
          paginacao={{ temMais, carregando: carregandoMais, carregarMais: () => carregarMais(false), carregarTudo: () => carregarMais(true) }}
        />
      )}

      <ModalVincularProduto
        aberto={!!estado.vinculandoId}
        produtos={produtos}
        onFechar={estado.fecharVincular}
        onEscolher={estado.confirmarVinculo}
      />
      {exportandoSalvas && (
        <ExportarPrecificacoesModal
          onClose={() => setExportandoSalvas(false)}
          empresa={empresa}
          grupos={[{ id: "individuais", rotulo: "Precificações individuais", lista: historico.filter((h) => h.origem === "individual") }]}
        />
      )}
      {estado.modaisExportacao}
      {estado.ConfirmDialog}
    </>
  );
}

/** Escolher a qual produto cadastrado uma precificação salva passa a se referir. */
function ModalVincularProduto({
  aberto,
  produtos,
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  produtos: ProdutoOpcao[];
  onFechar: () => void;
  onEscolher: (produtoId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const filtrados = produtos.filter((p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Modal open={aberto} onClose={onFechar} title="Vincular a um produto">
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto…"
        className={`${inputClass} mb-3`}
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {filtrados.map((p) => (
          <button
            key={p.id}
            onClick={() => onEscolher(p.id)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-text-primary"
          >
            <span className="font-mono text-xs text-text-tertiary">{p.sku}</span> — {p.nome}
          </button>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-text-tertiary text-center py-4">Nenhum produto encontrado.</p>}
      </div>
    </Modal>
  );
}
