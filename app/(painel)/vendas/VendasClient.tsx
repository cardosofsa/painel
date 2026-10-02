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
import { linkComprovanteWhatsapp } from "@/lib/comprovante";
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
  ANTERIOR,
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
import type { TabelaExport } from "@/lib/exportar";
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
  avisoShopee,
  disponivel,
}: {
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
  const lojasApi = useMemo(() => new Set(faltandoShopee.length ? [] : marketplace.conexoes.map((c) => c.loja_id)), [faltandoShopee.length, marketplace.conexoes]);
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
  const [anotando, setAnotando] = useState<{ chaves: string[]; inicial?: { observacao: string | null; tags: string[] } } | null>(null);
  const tagsUsadas = useMemo(() => tagsEmUso(lista), [lista]);

  const { sincronizar, sincronizandoSozinho, sincronizando } = useSincronizarShopee({ faltandoShopee, conexoes: marketplace.conexoes, avisoShopee });

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

  function avancar(ps: PedidoCentral[]) {
    if (!ps.length) return;
    const p0 = ps[0];
    if (p0.chave.startsWith("catalogo:")) return abrir(p0);
    const prox = PROXIMA[p0.etapa];
    if (!prox) return;
    const ids = ps.filter((p) => p.chave.startsWith("venda:") && p.etapa === p0.etapa).map((p) => p.id);
    setProcessando(ps.length === 1 ? p0.chave : "massa");
    startTransition(async () => {
      const r = await executarComToast(definirEtapaVendas(ids, prox.etapa), { erro: "Erro ao atualizar a etapa" });
      setProcessando(null);
      if (r.ok) {
        setSelecionados(new Set());
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

  function comprovanteLink(v: Venda) {
    const cliente = v.cliente_id ? clientes.find((c) => c.id === v.cliente_id) : null;
    return linkComprovanteWhatsapp(
      {
        numero: v.numero,
        itens: v.venda_itens.map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, garantia_dias: i.garantia_dias })),
        subtotal: v.subtotal,
        desconto: v.desconto,
        valorEntrega: v.valor_entrega,
        total: v.total,
        formaPagamento: v.forma_pagamento,
        clienteNome: v.cliente_nome,
      },
      cliente?.whatsapp ?? null,
    );
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
    const anotar = { label: "Observação e tags…", onClick: () => setAnotando({ chaves: [p.chave], inicial: { observacao: p.observacaoInterna, tags: p.tags } }) };
    if (p.origem === "marketplace")
      return [
        { label: "Ver detalhes", onClick: () => abrir(p) },
        anotar,
        ...(p.etapa === "retirada" && p.envio?.impressa ? [{ label: "Voltar para Para Imprimir", onClick: () => envio.voltarParaImprimir(p) }] : []),
      ];
    if (p.chave.startsWith("catalogo:")) return [{ label: "Abrir pedido", onClick: () => abrir(p) }];
    const v = vendaPorId.get(p.id);
    if (!v) return [];
    if (p.etapa === "cancelado") return [{ label: "Ver detalhes", onClick: () => setDetalhe(v) }];
    const voltar = ANTERIOR[p.etapa];
    return [
      { label: "Ver detalhes", onClick: () => setDetalhe(v) },
      anotar,
      { label: "Imprimir (PDF)", onClick: () => window.open(`/vendas/${v.id}/comprovante`, "_blank") },
      { label: "Enviar comprovante", onClick: () => window.open(comprovanteLink(v), "_blank") },
      { label: "Comprovante em imagem", onClick: () => comprovanteEmImagem(v) },
      ...(voltar ? [{ label: `Voltar para ${ROTULO_ETAPA[voltar]}`, onClick: () => voltarEtapa(p, voltar) }] : []),
      { label: "Editar", onClick: () => setEditando(v) },
      { label: "Cancelar venda", onClick: () => cancelar(v), destructive: true },
    ];
  }

  function tabela(): TabelaExport<PedidoCentral> {
    return {
      titulo: "Pedidos",
      subtitulo: `${etapa === "todos" ? "Todas as etapas" : etapa === "oculto" ? "Ocultos" : ROTULO_ETAPA[etapa]} · ${rotuloPeriodo(periodo)}`,
      colunas: [
        { rotulo: "Pedido", valor: (p) => p.numero },
        { rotulo: "Data", largura: 18, valor: (p) => new Date(p.data).toLocaleString("pt-BR") },
        { rotulo: "Canal", valor: (p) => p.canal },
        { rotulo: "Loja", valor: (p) => p.loja ?? "" },
        { rotulo: "Cliente", largura: 22, valor: (p) => p.cliente ?? "" },
        { rotulo: "UF", valor: (p) => p.uf ?? "" },
        { rotulo: "Produtos", largura: 40, valor: (p) => p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join("; ") },
        { rotulo: "Etapa", valor: (p) => ROTULO_ETAPA[p.etapa] },
        { rotulo: "Logística", valor: (p) => p.logistica ?? "" },
        { rotulo: "Valor", tipo: "moeda", valor: (p) => p.total },
        { rotulo: "Taxas", tipo: "moeda", valor: (p) => p.taxas },
        { rotulo: "Custo", tipo: "moeda", valor: (p) => p.custo },
        { rotulo: "Lucro", tipo: "moeda", valor: (p) => p.lucro },
        { rotulo: "Margem", tipo: "percentual", valor: (p) => (p.total > 0 ? p.lucro / p.total : 0) },
      ],
      linhas: filtrados,
    };
  }

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
          <p className="hidden lg:block text-[11px] text-text-tertiary mt-3 px-3">Para Emitir, Imprimir e Enviar mostram pedidos de qualquer data. As demais etapas seguem o período.</p>
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
          onWhatsapp={() => window.open(comprovanteLink(detalhe), "_blank")}
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
