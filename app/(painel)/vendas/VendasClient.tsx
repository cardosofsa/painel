"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownUp, BarChart3, Link2, RefreshCw, ScanBarcode, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { executarComToast } from "@/lib/acao-cliente";
import { periodoAnterior, periodoDoAtalho, rotuloPeriodo, type Periodo } from "@/lib/periodo";
import {
  contarEtapas,
  filtrarCentral,
  FILTROS_VAZIOS,
  indicadores,
  montarCentral,
  opcoesFiltro,
  tagsEmUso,
  PROXIMA,
  ROTULO_ETAPA,
  ROTULO_MOTIVO,
  ROTULO_SUB_ENVIO,
  subEnvio,
  type SubEnvio,
  type Etapa,
  type EtapaVenda,
  type MotivoReserva,
  type FiltrosCentral,
  type PedidoCentral,
  type VendaIn,
} from "@/lib/pedidos-central";
import type { DadosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import type { PedidoVitrine } from "@/lib/pedidos-vitrine-tipos";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";
import { obterComprovante } from "./comprovante-actions";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";
import { cancelarVenda } from "./actions";
import { definirEtapaVendas, definirLogisticaVenda } from "./central-actions";
import { useSincronizarShopee } from "@/components/vendas/central/useSincronizarShopee";
import { EditarVendaModal, type ClienteOpcao } from "./EditarVendaModal";
import { DetalheVendaModal } from "@/components/vendas/DetalheVendaModal";
import { LinhaPedido } from "@/components/vendas/central/LinhaPedido";
import { MenuEtapas } from "@/components/vendas/central/MenuEtapas";
import { BarraFiltros } from "@/components/vendas/central/BarraFiltros";
import { FiltrosModal, contarExtras, type FiltrosExtras } from "@/components/vendas/central/FiltrosModal";
import { KpisVendas } from "@/components/vendas/central/KpisVendas";
import { PedidoCatalogoModal } from "@/components/vendas/central/PedidoCatalogoModal";
import { DetalheMarketplaceModal } from "@/components/vendas/central/DetalheMarketplaceModal";
import { VincularAnunciosModal } from "@/components/vendas/central/VincularAnunciosModal";
import { ImportarExportarModal } from "@/components/vendas/central/ImportarExportarModal";
import { AcoesMassa } from "@/components/vendas/central/AcoesMassa";
import { AnotarModal } from "@/components/vendas/central/AnotarModal";
import { SubAbas } from "@/components/vendas/central/SubAbas";
import { useEnvioShopee } from "@/components/vendas/central/useEnvioShopee";
import { EtiquetaFreteModal } from "@/components/vendas/central/EtiquetaFreteModal";
import { ConfirmarImpressaoModal } from "@/components/vendas/central/ConfirmarImpressaoModal";
import { DevolucaoModal } from "@/components/vendas/DevolucaoModal";
import { comprovanteLink, montarAcoesPedido, tabelaPedidos } from "@/components/vendas/central/acoesPedido";
import { ImportarShopeeModal, type LojaMarketplace, type ProdutoMarketplace } from "@/components/vendas/marketplace/ImportarShopeeModal";

import type { Venda } from "./tipos-venda";
export type { Venda, VendaItem } from "./tipos-venda";

const POR_PAGINA = 40;

const EXTRAS_VAZIOS: FiltrosExtras = {
  pagamento: [],
  logistica: "",
  uf: "",
  valorMin: null,
  valorMax: null,
  soPrejuizo: false,
  soSemCusto: false,
  tag: "",
};

/**
 * Vendas = central de pedidos (como num ERP): PDV, catálogo e marketplaces juntos, por
 * etapa de expedição (Para Emitir → Imprimir → Enviar → Enviado → Concluído), com período,
 * canais/lojas, filtros, lucro de cada pedido e ações em massa. Números e gráficos ficam em
 * /vendas/relatorios.
 */
export function VendasClient({
  vendas,
  diasJanela,
  clientes,
  formasPagamento,
  pedidos,
  clientesPdv,
  contas,
  formasPagamentoPdv,
  pedidoInicial,
  marketplace,
  lojasMarketplace,
  produtosMarketplace,
  impostoPct,
  faltandoShopee,
  plataformasLigadas = [],
  avisoShopee,
  disponivel,
  freteConectado = false,
}: {
  freteConectado?: boolean;
  /** produto → disponível (físico − reservado). */
  disponivel: Record<string, number>;
  vendas: Venda[];
  diasJanela: number;
  clientes: (ClienteOpcao & { whatsapp: string | null })[];
  formasPagamento: string[];
  pedidos: PedidoVitrine[];
  clientesPdv: ClientePdv[];
  contas: ContaPdv[];
  formasPagamentoPdv: FormaPagamentoPdv[];
  pedidoInicial: string | null;
  marketplace: DadosMarketplace;
  lojasMarketplace: LojaMarketplace[];
  produtosMarketplace: ProdutoMarketplace[];
  impostoPct: number;
  faltandoShopee: string[];
  /** Plataformas com API ligada neste servidor (10.8: Shopee e/ou Mercado Livre). */
  plataformasLigadas?: string[];
  avisoShopee: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const { gerar: gerarImagem, oculto: comprovanteOculto } = useComprovanteImagem();

  const lista = useMemo(
    () =>
      montarCentral({
        vendas: vendas as VendaIn[],
        pedidosCatalogo: pedidos,
        marketplace: marketplace.pedidos,
        lojas: lojasMarketplace,
        disponivel: new Map(Object.entries(disponivel)),
      }),
    [vendas, pedidos, marketplace.pedidos, lojasMarketplace, disponivel],
  );

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("hoje"));
  const [canais, setCanais] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [extras, setExtras] = useState<FiltrosExtras>(EXTRAS_VAZIOS);
  const filtros: FiltrosCentral = useMemo(() => ({ periodo, canais, busca, ...extras }), [periodo, canais, busca, extras]);
  const contagem = useMemo(() => contarEtapas(lista, filtros), [lista, filtros]);
  const [etapa, setEtapa] = useState<Etapa | "todos" | "oculto">(() => {
    const c = contarEtapas(lista, { ...FILTROS_VAZIOS, periodo: periodoDoAtalho("hoje") });
    return c.emitir > 0 ? "emitir" : c.imprimir > 0 ? "imprimir" : "todos";
  });
  const [motivo, setMotivo] = useState<MotivoReserva | "todos">("todos");
  const [sub, setSub] = useState<SubEnvio | "todos">("todos");
  const daEtapa = useMemo(() => filtrarCentral(lista, filtros, etapa), [lista, filtros, etapa]);
  const filtrados = useMemo(() => {
    if (etapa === "reservar" && motivo !== "todos") return daEtapa.filter((p) => p.motivoReserva === motivo);
    if (etapa === "enviar" && sub !== "todos") return daEtapa.filter((p) => p.origem === "marketplace" && subEnvio(p) === sub);
    return daEtapa;
  }, [daEtapa, etapa, motivo, sub]);
  const conexoesLigadas = useMemo(() => marketplace.conexoes.filter((c) => plataformasLigadas.includes(c.plataforma)), [marketplace.conexoes, plataformasLigadas]);
  const lojasApi = useMemo(() => new Map(conexoesLigadas.map((c) => [c.loja_id, c.plataforma])), [conexoesLigadas]);
  const envio = useEnvioShopee({ lojasApi });
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processando, setProcessando] = useState<string | null>(null);

  const kpiAtual = useMemo(() => indicadores(lista, filtros), [lista, filtros]);
  const kpiAnterior = useMemo(() => indicadores(lista, { ...filtros, periodo: periodoAnterior(filtros.periodo) }), [lista, filtros]);
  const { ufs, logisticas } = useMemo(() => opcoesFiltro(lista), [lista]);
  const semCusto = marketplace.pedidos.some((p) => p.custo_incompleto && p.status !== "cancelado" && p.status !== "devolvido");

  // Modais
  const vendaPorId = useMemo(() => new Map(vendas.map((v) => [v.id, v])), [vendas]);
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  const [editando, setEditando] = useState<Venda | null>(null);
  const [catalogo, setCatalogo] = useState<PedidoVitrine | null>(() => (pedidoInicial ? (pedidos.find((p) => p.numero === pedidoInicial) ?? null) : null));
  const [detalheMkt, setDetalheMkt] = useState<PedidoCentral | null>(null);
  const [filtrando, setFiltrando] = useState(false);
  const [impExp, setImpExp] = useState(false);
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [etiquetando, setEtiquetando] = useState<PedidoCentral | null>(null);
  const [imprimindo, setImprimindo] = useState<PedidoCentral[] | null>(null);
  const [devolvendo, setDevolvendo] = useState<Venda | null>(null);
  const [anotando, setAnotando] = useState<{ chaves: string[]; inicial?: { observacao: string | null; tags: string[] } } | null>(null);
  const tagsUsadas = useMemo(() => tagsEmUso(lista), [lista]);

  const { sincronizar, sincronizandoSozinho, sincronizando } = useSincronizarShopee({ conexoes: conexoesLigadas, avisoShopee });

  function mudarEtapa(e: Etapa | "todos" | "oculto") {
    setEtapa(e);
    setMotivo("todos");
    setSub("todos");
    setSelecionados(new Set());
    setMostrar(POR_PAGINA);
  }

  function abrir(p: PedidoCentral) {
    if (p.origem === "marketplace") setDetalheMkt(p);
    else if (p.chave.startsWith("catalogo:")) setCatalogo(pedidos.find((x) => x.id === p.id) ?? null);
    else setDetalhe(vendaPorId.get(p.id) ?? null);
  }

  /** Para Imprimir: abre a impressão (um ou vários) e depois pergunta se saiu. */
  function imprimir(ps: PedidoCentral[]) {
    const vendas = ps.filter((p) => p.chave.startsWith("venda:") && p.etapa === "imprimir");
    if (!vendas.length) return;
    window.open(`/vendas/imprimir?ids=${vendas.map((p) => p.id).join(",")}`, "_blank");
    setImprimindo(vendas);
  }

  function avancar(ps: PedidoCentral[], confirmado = false) {
    if (!ps.length) return;
    const p0 = ps[0];
    if (p0.chave.startsWith("catalogo:")) return abrir(p0);
    if (p0.etapa === "imprimir" && !confirmado) return imprimir(ps);
    const prox = PROXIMA[p0.etapa];
    if (!prox) return;
    const ids = ps.filter((p) => p.chave.startsWith("venda:") && p.etapa === p0.etapa).map((p) => p.id);
    setProcessando(ps.length === 1 ? p0.chave : "massa");
    startTransition(async () => {
      const r = await executarComToast(definirEtapaVendas(ids, prox.etapa), { erro: "Erro ao atualizar a etapa" });
      setProcessando(null);
      if (r.ok) {
        setSelecionados(new Set());
        setImprimindo(null);
        toast.success(`${ids.length} pedido(s) em ${ROTULO_ETAPA[prox.etapa]}.`);
      }
    });
  }

  function voltarEtapa(p: PedidoCentral, para: EtapaVenda) {
    startTransition(async () => {
      await executarComToast(definirEtapaVendas([p.id], para), { sucesso: `Pedido ${p.numero} em ${ROTULO_ETAPA[para]}`, erro: "Erro ao atualizar a etapa" });
    });
  }

  function mudarLogistica(p: PedidoCentral, l: string | null) {
    startTransition(async () => {
      await executarComToast(definirLogisticaVenda(p.id, l), { erro: "Erro ao salvar a logística" });
    });
  }

  async function comprovanteEmImagem(v: Venda) {
    const r = await executarComToast(obterComprovante(v.id), { erro: "Erro ao carregar o comprovante" });
    if (r.ok) gerarImagem(r.dado);
  }

  async function cancelar(v: Venda) {
    const ok = await confirm({
      title: `Cancelar a venda ${v.numero}?`,
      message: "O estoque volta para os produtos e o valor é estornado do caixa. A venda fica registrada como cancelada — não é apagada.",
      confirmLabel: "Cancelar venda",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(cancelarVenda(v.id), { sucesso: `Venda ${v.numero} cancelada`, erro: "Erro ao cancelar a venda" });
      if (r.ok) setDetalhe(null);
    });
  }

  function acoesDe(p: PedidoCentral) {
    return montarAcoesPedido(p, {
      venda: vendaPorId.get(p.id),
      freteConectado,
      abrir: () => abrir(p),
      anotar: () => setAnotando({ chaves: [p.chave], inicial: { observacao: p.observacaoInterna, tags: p.tags } }),
      voltarParaImprimir: () => envio.voltarParaImprimir(p),
      detalhe: setDetalhe,
      etiqueta: () => setEtiquetando(p),
      whatsapp: (v) => window.open(comprovanteLink(v, clientes), "_blank"),
      imagem: comprovanteEmImagem,
      voltarEtapa: (para) => voltarEtapa(p, para),
      devolver: setDevolvendo,
      editar: setEditando,
      cancelar,
    });
  }

  const tabela = () => tabelaPedidos(filtrados, etapa === "todos" ? "Todas as etapas" : etapa === "oculto" ? "Ocultos" : ROTULO_ETAPA[etapa], rotuloPeriodo(periodo));

  const ultimaSync = marketplace.conexoes.map((c) => c.ultima_sincronizacao).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const nomesCatalogos = [...new Set(pedidos.map((p) => p.catalogo_nome).filter((n): n is string => !!n))].sort();
  const nExtras = contarExtras(extras);
  const visiveis = filtrados.slice(0, mostrar);
  // Seleciona qualquer pedido (menos o do catálogo ainda a aprovar, que é um por vez).
  const selecionaveis = visiveis.filter((p) => !p.chave.startsWith("catalogo:"));
  const lotes = filtrados.filter((p) => selecionados.has(p.chave));
  // Ação da etapa em massa: só quando todos são vendas do sistema na mesma etapa.
  const mesmaEtapa = lotes.length > 0 && lotes.every((p) => p.chave.startsWith("venda:") && p.etapa === lotes[0].etapa);
  const proxLote = mesmaEtapa ? PROXIMA[lotes[0].etapa] : undefined;

  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <>
            <Button
              variant="secondary"
              loading={sincronizando || sincronizandoSozinho}
              onClick={sincronizar}
              title={ultimaSync ? `Última sincronização: ${new Date(ultimaSync).toLocaleString("pt-BR")}` : "Puxa agora os pedidos das lojas conectadas à API"}
            >
              <RefreshCw size={14} /> {sincronizandoSozinho ? "Sincronizando…" : "Sincronizar pedidos"}
            </Button>
            <Button variant="secondary" onClick={() => setImpExp(true)}>
              <ArrowDownUp size={14} /> Importar/Exportar
            </Button>
            <Link href="/vendas/relatorios">
              <Button variant="secondary">
                <BarChart3 size={14} /> Relatórios
              </Button>
            </Link>
            <Link href="/pdv">
              <Button variant="primary">
                <ScanBarcode size={14} /> Abrir PDV
              </Button>
            </Link>
          </>
        }
      />

      <BarraFiltros
        periodo={periodo}
        onPeriodo={(p) => (setPeriodo(p), setMostrar(POR_PAGINA))}
        diasJanela={diasJanela}
        canais={canais}
        onCanais={setCanais}
        lojas={lojasMarketplace}
        catalogos={nomesCatalogos}
        busca={busca}
        onBusca={setBusca}
        nExtras={nExtras}
        onFiltrar={() => setFiltrando(true)}
        onLimpar={() => {
          setCanais([]);
          setBusca("");
          setExtras(EXTRAS_VAZIOS);
        }}
      />

      <KpisVendas atual={kpiAtual} anterior={kpiAnterior} rotuloAnterior="anterior" />

      {semCusto && (
        <button type="button" onClick={() => setVinculando(true)} className="w-full mb-4 flex items-center gap-2 rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative text-left">
          <Link2 size={14} className="shrink-0" /> Há pedidos da Shopee com anúncio sem produto vinculado (sem custo e sem baixa no estoque). Vincular agora ›
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] gap-4 items-start">
        <div className="lg:sticky lg:top-4 min-w-0">
          <MenuEtapas valor={etapa} onChange={mudarEtapa} contagem={contagem} />
          <p className="hidden lg:block text-[11px] text-text-tertiary mt-3 px-3">De Para Reservar até Para Retirada aparecem pedidos de qualquer data. Enviado, Concluído e Cancelado seguem o período.</p>
        </div>

        <div className="min-w-0 space-y-3">
          {etapa === "reservar" && (
            <SubAbas
              valor={motivo}
              onChange={setMotivo}
              itens={(["todos", "nao_mapeado", "sem_estoque", "revisao"] as const).map((m) => ({
                id: m,
                rotulo: m === "todos" ? "Todos" : ROTULO_MOTIVO[m],
                n: m === "todos" ? daEtapa.length : daEtapa.filter((p) => p.motivoReserva === m).length,
              }))}
            />
          )}
          {etapa === "enviar" && daEtapa.some((p) => p.origem === "marketplace" && p.lojaId && lojasApi.has(p.lojaId)) && (
            <SubAbas
              valor={sub}
              onChange={setSub}
              itens={(["todos", "programar", "programando", "falha"] as const).map((m) => ({
                id: m,
                rotulo: m === "todos" ? "Todos" : ROTULO_SUB_ENVIO[m],
                n: m === "todos" ? daEtapa.length : daEtapa.filter((p) => p.origem === "marketplace" && subEnvio(p) === m).length,
              }))}
            />
          )}

          {lotes.length > 0 ? (
            <AcoesMassa
              selecionados={lotes}
              onLimpar={() => setSelecionados(new Set())}
              onAnotar={() => setAnotando({ chaves: lotes.filter((p) => !p.chave.startsWith("catalogo:")).map((p) => p.chave) })}
              acaoEtapa={
                proxLote
                  ? { rotulo: `${proxLote.acao} (${lotes.length})`, executar: () => avancar(lotes), carregando: processando === "massa" }
                  : envio.acaoEmMassa(lotes)
                    ? { rotulo: `${envio.acaoEmMassa(lotes)} (${lotes.length})`, executar: () => envio.executar(lotes, () => setSelecionados(new Set())), carregando: envio.ocupado }
                    : null
              }
              verOcultos={etapa === "oculto"}
            />
          ) : (
            selecionaveis.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={(e) => setSelecionados(e.target.checked ? new Set(selecionaveis.map((p) => p.chave)) : new Set())}
                />
                Selecionar todos desta página (para imprimir lista de separação, romaneio…)
              </label>
            )
          )}

          {filtrados.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title={etapa === "todos" ? "Nenhum pedido no período" : `Nada em ${etapa === "oculto" ? "Oculto" : ROTULO_ETAPA[etapa]}`}
                description={
                  faltandoShopee.length === 0 || marketplace.conexoes.length
                    ? "Mude o período, os canais ou os filtros."
                    : "Mude o período ou os filtros. Para trazer pedidos da Shopee, conecte a loja em Configurações → Canais de venda ou importe a planilha."
                }
              />
            </Card>
          ) : (
            visiveis.map((p) => (
              <LinhaPedido
                key={p.chave}
                p={p}
                selecionado={selecionados.has(p.chave)}
                onSelecionar={(v) =>
                  setSelecionados((s) => {
                    const n = new Set(s);
                    if (v) n.add(p.chave);
                    else n.delete(p.chave);
                    return n;
                  })
                }
                onAbrir={() => abrir(p)}
                onAvancar={() => avancar([p])}
                onVincular={() => setVinculando(true)}
                acaoExtra={envio.acaoDe(p) ? { rotulo: envio.acaoDe(p) as string, onClick: () => envio.executar([p]), carregando: envio.ocupado } : undefined}
                onLogistica={(l) => mudarLogistica(p, l)}
                acoes={acoesDe(p)}
                processando={processando === p.chave}
                mostrarEtapa={etapa === "todos" || etapa === "oculto"}
              />
            ))
          )}
          {filtrados.length > mostrar && (
            <Button variant="secondary" className="w-full" onClick={() => setMostrar((m) => m + POR_PAGINA)}>
              Mostrar mais ({filtrados.length - mostrar} restantes)
            </Button>
          )}
        </div>
      </div>

      {detalhe && (
        <DetalheVendaModal
          venda={detalhe}
          onClose={() => setDetalhe(null)}
          onWhatsapp={() => window.open(comprovanteLink(detalhe, clientes), "_blank")}
          onImagem={() => comprovanteEmImagem(detalhe)}
          onEditar={() => setEditando(detalhe)}
          onCancelar={() => cancelar(detalhe)}
          cancelando={pending}
        />
      )}
      {/* `key`: os useState de EditarVendaModal leem `venda` na montagem. */}
      <EditarVendaModal
        key={editando?.id ?? "fechado"}
        venda={editando}
        clientes={clientes}
        formasPagamento={formasPagamento}
        onClose={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          setDetalhe(null);
        }}
      />
      {catalogo && <PedidoCatalogoModal key={catalogo.id} pedido={catalogo} onClose={() => setCatalogo(null)} clientes={clientesPdv} contas={contas} formasPagamento={formasPagamentoPdv} />}
      {detalheMkt && <DetalheMarketplaceModal p={detalheMkt} bruto={marketplace.pedidos.find((x) => x.id === detalheMkt.id)} onClose={() => setDetalheMkt(null)} />}
      {filtrando && <FiltrosModal inicial={extras} onAplicar={setExtras} onClose={() => setFiltrando(false)} ufs={ufs} logisticas={logisticas} tags={tagsUsadas} />}
      {envio.modal(() => setSelecionados(new Set()))}
      {devolvendo && (
        <DevolucaoModal
          vendaId={devolvendo.id}
          numero={devolvendo.numero}
          totalRestante={Number(devolvendo.total)}
          fiado={devolvendo.status === "fiado"}
          contas={contas}
          onClose={() => setDevolvendo(null)}
        />
      )}
      {imprimindo && (
        <ConfirmarImpressaoModal
          numeros={imprimindo.map((p) => p.numero)}
          onImprimirDeNovo={() => window.open(`/vendas/imprimir?ids=${imprimindo.map((p) => p.id).join(",")}`, "_blank")}
          onConfirmar={() => avancar(imprimindo, true)}
          onClose={() => setImprimindo(null)}
          carregando={processando !== null}
        />
      )}
      {etiquetando && <EtiquetaFreteModal vendaId={etiquetando.id} numero={etiquetando.numero} onClose={() => setEtiquetando(null)} />}
      {anotando && <AnotarModal chaves={anotando.chaves} inicial={anotando.inicial} tagsSugeridas={tagsUsadas} onClose={() => setAnotando(null)} />}
      {impExp && <ImportarExportarModal onClose={() => setImpExp(false)} onImportarShopee={() => setImportando(true)} onExportar={() => setExportando(true)} podeImportar={marketplace.disponivel} />}
      {importando && <ImportarShopeeModal onClose={() => setImportando(false)} lojas={lojasMarketplace} produtos={produtosMarketplace} vinculos={marketplace.vinculos} impostoPct={impostoPct} />}
      {exportando && (
        <ExportarModal aberto onClose={() => setExportando(false)} titulo="Exportar pedidos" escopos={[{ id: "filtrados", rotulo: "Lista atual (filtros e período)", quantidade: filtrados.length }]} montar={tabela} />
      )}
      {vinculando && <VincularAnunciosModal pedidos={marketplace.pedidos} lojas={lojasMarketplace} produtos={produtosMarketplace} onClose={() => setVinculando(false)} />}
      {ConfirmDialog}
      {comprovanteOculto}
    </>
  );
}
