"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { executarComToast } from "@/lib/acao-cliente";
import { carregarHistoricoPrecificacoes, descartarRascunhoPrecificacao } from "./actions";
import { useRascunhoPrecificacao, type RascunhoPendente, type VisaoRascunho } from "@/lib/precificacao-rascunho";
import { AvisoRascunho, IndicadorRascunho } from "@/components/precificacao/RascunhoAviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProtegerSaida } from "@/lib/hooks/useProtegerSaida";
import { ModalSaida } from "@/components/ui/ModalSaida";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { Calculator, Download, History, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/Combobox";
import { ExportarPrecificacoesModal } from "@/components/precificacao/ExportarPrecificacoes";
import { formatBRL, formatarData } from "@/lib/format";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";
import { VariacoesView } from "@/components/precificacao/VariacoesView";
import { KitsView } from "@/components/precificacao/KitsView";
import { IndividualNova } from "@/components/precificacao/IndividualNova";
import { HistoricoPrecificacoes } from "@/components/precificacao/HistoricoPrecificacoes";
import { RaioXView } from "@/components/precificacao/RaioXView";
import { SimuladorPromocao } from "@/components/precificacao/SimuladorPromocao";
import type { VisaoPrecificacao } from "@/lib/precificacao-tipos";
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
  { value: "raio-x", label: "Raio-X" },
  { value: "promocao", label: "Promoção" },
] as const satisfies readonly TabItem<VisaoPrecificacao>[];

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
  visaoInicial,
  rascunhosPendentes = [],
  precosLoja = null,
  inicial,
  anunciosLoja = [],
}: {
  /** Anúncios sincronizados (um por item), para "Analisar anúncio". */
  anunciosLoja?: { id: string; nome: string }[];
  /** Preço de cada produto em cada loja (0101); `null` sem a migração. */
  precosLoja?: { produto_id: string; loja_id: string; preco: number; preco_atualizado_em: string | null; taxa_adicional_pct?: number | null }[] | null;
  inicial?: { produtoId: string | null; lojaId: string | null };
  /** Rascunhos guardados no banco (0100), das quatro abas, o mais recente primeiro. */
  rascunhosPendentes?: RascunhoPendente[];
  empresa: { nome: string | null; logoUrl: string | null } | null;
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
  visaoInicial?: VisaoPrecificacao;
}) {
  const [exportandoSalvas, setExportandoSalvas] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const router = useRouter();
  // O histórico abre num pop-up (antes era uma aba).
  const [historicoAberto, setHistoricoAberto] = useState(false);
  // Linhas mais antigas buscadas sob demanda (a página traz só as 50 mais recentes).
  const [maisAntigas, setMaisAntigas] = useState<PrecificacaoHist[]>([]);
  const [temMais, setTemMais] = useState(historico.length >= POR_PAGINA);
  const [carregandoMais, startCarregar] = useTransition();
  // Depois de salvar, o servidor manda as 50 de novo: o que já estava na tela não duplica.
  const historicoCompleto = useMemo(() => {
    const ids = new Set(historico.map((h) => h.id));
    return [...historico, ...maisAntigas.filter((h) => !ids.has(h.id))];
  }, [historico, maisAntigas]);
  // O hook do rascunho roda depois do estado e precisa dele; o estado lê o rascunho só na hora de salvar.
  const rascRef = useRef<ReturnType<typeof useRascunhoPrecificacao> | null>(null);
  const estado = usePrecificacao({
    historico: historicoCompleto,
    produtos,
    aliquotaDasPadrao,
    lojas,
    anuncios,
    concorrentesPorProduto,
    empresa,
    visaoInicial,
    rascunhoAtual: { id: () => rascRef.current?.rascunhoId ?? null, aoSalvar: () => rascRef.current?.aoSalvarPrecificacao() },
    inicial,
  });
  const rasc = useRascunhoPrecificacao({ instantaneo: estado.instantaneo, temConteudo: estado.temConteudo, titulo: estado.tituloRascunho, produtoId: estado.produtoId });
  useEffect(() => {
    rascRef.current = rasc;
  });

  // Variações, Kits e Em Massa guardam o próprio rascunho e contam aqui se estão sujas:
  // a proteção de saída cobre a tela inteira, não só a aba visível.
  const [abasSujas, setAbasSujas] = useState<Partial<Record<VisaoRascunho, boolean>>>({});
  const salvadores = useRef<Partial<Record<VisaoRascunho, () => Promise<boolean>>>>({});
  const relatar = useCallback((v: VisaoRascunho, sujo: boolean, salvar: (() => Promise<boolean>) | undefined) => {
    salvadores.current[v] = salvar;
    setAbasSujas((a) => (!!a[v] === sujo ? a : { ...a, [v]: sujo }));
  }, []);
  const algumaSuja = rasc.sujo || Object.values(abasSujas).some(Boolean);
  async function salvarTodosRascunhos() {
    const pendentes = [...(rasc.sujo ? [rasc.salvarRascunho] : []), ...Object.entries(abasSujas).flatMap(([v, sujo]) => (sujo && salvadores.current[v as VisaoRascunho] ? [salvadores.current[v as VisaoRascunho]!] : []))];
    const r = await Promise.all(pendentes.map((f) => f()));
    return r.every(Boolean);
  }
  // Sem a 0100 não há onde guardar: o modal oferece só ficar ou sair.
  const protecao = useProtegerSaida({ sujo: algumaSuja, salvarRascunho: rasc.semMigracao ? undefined : salvarTodosRascunhos });
  const pendentePorAba = (v: VisaoRascunho) => rascunhosPendentes.find((r) => (r.visao ?? "individual") === v) ?? null;
  const [pendente, setPendente] = useState<RascunhoPendente | null>(pendentePorAba("individual"));

  function continuarRascunho(r: RascunhoPendente) {
    estado.aplicarInstantaneo(r.dados);
    rasc.adotar(r);
    setPendente(null);
  }

  async function descartarPendente(r: RascunhoPendente) {
    const ok = await estado.confirm({ title: "Descartar o rascunho?", message: `“${r.titulo || "Sem nome"}” será apagado. Não dá para desfazer.`, confirmLabel: "Descartar" });
    if (!ok) return;
    const res = await executarComToast(descartarRascunhoPrecificacao(r.id), { sucesso: "Rascunho descartado", erro: "Não foi possível descartar." });
    if (res.ok) setPendente(null);
  }

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
  // Abas montadas uma vez continuam montadas (escondidas): trocar de aba não perde o digitado.
  const [montadas, setMontadas] = useState<ReadonlySet<VisaoPrecificacao>>(() => new Set<VisaoPrecificacao>(["individual", visao]));
  if (!montadas.has(visao)) setMontadas(new Set(montadas).add(visao));
  // A aba fica na URL (voltar, recarregar, mandar o link). Sem passar pelo roteador: nada a buscar no servidor.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("visao") === visao) return;
    url.searchParams.set("visao", visao);
    window.history.replaceState(window.history.state, "", url);
  }, [visao]);
  const mostrar = (v: VisaoPrecificacao) => montadas.has(v);

  function acoesLigarProduto(h: PrecificacaoHist) {
    return [
      { label: "Vincular a um produto", onClick: () => estado.abrirVincular(h) },
      ...(h.produto_id ? [{ label: "Aplicar preço ao produto", onClick: () => estado.aplicarPrecoDoHistorico(h) }] : []),
      { label: "Criar produto a partir desta precificação", onClick: () => estado.criarProdutoDoHistorico(h) },
    ];
  }

  return (
    <>
      <PageHeader
        title="Calculadora de Precificação"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAnalisando(true)} disabled={anunciosLoja.length === 0} title={anunciosLoja.length === 0 ? "Conecte e sincronize uma loja para analisar os anúncios" : undefined}>
              <ScanSearch size={14} aria-hidden /> Analisar anúncio
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setHistoricoAberto(true)}>
              <History size={14} aria-hidden /> Histórico
            </Button>
          </>
        }
      />

      {/* Estas quatro abas eram <button> cru: sem indicador, sem ARIA e sem teclado —
          na tela mais importante do produto, enquanto Admin e Configurações já usavam
          o <Tabs>. Duas telas do mesmo app navegavam de jeitos visualmente diferentes. */}
      <Tabs tabs={ABAS_PRECIFICACAO} value={visao} onChange={setVisao} className="mb-5" />

      <div hidden={visao !== "individual"}>
        {pendente && <AvisoRascunho pendente={pendente} onContinuar={() => continuarRascunho(pendente)} onDescartar={() => void descartarPendente(pendente)} />}
        <IndividualNova
          estado={estado}
          produtos={produtos}
          lojas={lojas}
          iaDisponivel={iaDisponivel}
          precosLoja={precosLoja}
          onSalvarRascunho={() => void rasc.salvarRascunho()}
          salvandoRascunho={rasc.salvando}
          indicadorRascunho={<IndicadorRascunho sujo={rasc.sujo} salvando={rasc.salvando} salvoEm={rasc.salvoEm} semMigracao={rasc.semMigracao} />}
        />

        <Card className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Precificações salvas</h2>
            <div className="flex items-center gap-3">
              {/* Exporta as mesmas que o cartão lista (as individuais); antes levava também as em massa. */}
              <Button variant="secondary" size="sm" onClick={() => setExportandoSalvas(true)} disabled={!historico.some((h) => h.origem === "individual")}>
                <Download size={14} aria-hidden /> Exportar
              </Button>
              <IconButton onClick={() => setHistoricoAberto(true)} aria-label="Ver histórico completo" title="Ver histórico completo">
                <History size={14} />
              </IconButton>
            </div>
          </div>
          <div className="space-y-2">
            {historico
              .filter((h) => h.origem === "individual")
              .slice(0, 5)
              .map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-text-primary truncate">{h.produto_nome}</div>
                    <div className="text-xs text-text-tertiary">{formatarData(h.criado_em)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
                    <RowMenu actions={acoesLigarProduto(h)} />
                  </div>
                </div>
              ))}
            {!historico.some((h) => h.origem === "individual") && <EmptyState icon={Calculator} title="Nenhuma precificação salva ainda" description="Escolha o produto, onde vende e como quer lucrar, e use “Salvar precificação”." />}
          </div>
        </Card>
      </div>

      {mostrar("variacoes") && (
        <div hidden={visao !== "variacoes"}>
          <VariacoesView
            produtos={produtos}
            lojas={lojas}
            anuncios={anuncios}
            aliquotaDasPadrao={aliquotaDasPadrao}
            confirm={estado.confirm}
            onVerHistorico={() => setHistoricoAberto(true)}
            empresa={empresa}
            rascunhoPendente={pendentePorAba("variacoes")}
            relatar={relatar}
          />
        </div>
      )}
      {mostrar("kits") && (
        <div hidden={visao !== "kits"}>
          <KitsView produtos={produtos} lojas={lojas} aliquotaDasPadrao={aliquotaDasPadrao} empresa={empresa} confirm={estado.confirm} rascunhoPendente={pendentePorAba("kits")} relatar={relatar} />
        </div>
      )}
      {mostrar("massa") && (
        <div hidden={visao !== "massa"}>
          <CalculadoraEmMassa
            produtos={produtos}
            lojas={lojas}
            aliquotaDasPadrao={aliquotaDasPadrao}
            historico={historico}
            onVerHistorico={() => setHistoricoAberto(true)}
            empresa={empresa}
            rascunhoPendente={pendentePorAba("massa")}
            relatar={relatar}
          />
        </div>
      )}
      {mostrar("raio-x") && (
        <div hidden={visao !== "raio-x"}>
          <RaioXView lojas={lojas} produtos={produtos} onAbrir={estado.duplicarHistorico} empresa={empresa} />
        </div>
      )}
      {mostrar("promocao") && (
        <div hidden={visao !== "promocao"}>
          <SimuladorPromocao historico={historicoCompleto} lojas={lojas} produtos={produtos} />
        </div>
      )}

      <Modal open={historicoAberto} onClose={() => setHistoricoAberto(false)} title="Histórico de precificações" width="max-w-5xl">
        <HistoricoPrecificacoes
          // Duplicar leva a precificação para a aba Individual: o pop-up fecha junto.
          estado={{
            ...estado,
            duplicarHistorico: (h) => {
              estado.duplicarHistorico(h);
              setHistoricoAberto(false);
            },
          }}
          anuncios={anuncios}
          acoesLigarProduto={acoesLigarProduto}
          empresa={empresa}
          paginacao={{ temMais, carregando: carregandoMais, carregarMais: () => carregarMais(false), carregarTudo: () => carregarMais(true) }}
        />
      </Modal>

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
      <ModalSaida protecao={protecao} />
      <Modal open={analisando} onClose={() => setAnalisando(false)} title="Analisar um anúncio da loja">
        <p className="text-sm text-text-secondary mb-3">Título, imagens, preço e estratégia de um anúncio sincronizado.</p>
        <Combobox
          itens={anunciosLoja.map((a) => ({ id: a.id, rotulo: a.nome }))}
          valor={null}
          onChange={(id) => {
            if (!id) return;
            setAnalisando(false);
            router.push(`/anuncio/analise/${id}`);
          }}
          placeholder="Buscar anúncio pelo título…"
        />
      </Modal>
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
