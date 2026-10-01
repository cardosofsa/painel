"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp, BarChart3, Link2, RefreshCw, ScanBarcode, Search, SlidersHorizontal, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { SeletorPeriodo } from "@/components/ui/SeletorPeriodo";
import { inputClass } from "@/components/ui/Modal";
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
  ANTERIOR,
  PROXIMA,
  ROTULO_ETAPA,
  ROTULO_MOTIVO,
  type Etapa,
  type EtapaVenda,
  type MotivoReserva,
  type FiltrosCentral,
  type PedidoCentral,
  type VendaIn,
} from "@/lib/pedidos-central";
import type { StatusEnvio } from "@/lib/vendas-painel";
import type { TabelaExport } from "@/lib/exportar";
import type { DadosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import type { PedidoVitrine } from "@/lib/pedidos-vitrine-tipos";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";
import { obterComprovante } from "./comprovante-actions";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";
import { cancelarVenda } from "./actions";
import { definirEtapaVendas, definirLogisticaVenda, sincronizarTodasShopee } from "./central-actions";
import { EditarVendaModal, type ClienteOpcao } from "./EditarVendaModal";
import { DetalheVendaModal } from "@/components/vendas/DetalheVendaModal";
import { LinhaPedido } from "@/components/vendas/central/LinhaPedido";
import { MenuEtapas } from "@/components/vendas/central/MenuEtapas";
import { FiltroCanais } from "@/components/vendas/central/FiltroCanais";
import { FiltrosModal, contarExtras, type FiltrosExtras } from "@/components/vendas/central/FiltrosModal";
import { KpisVendas } from "@/components/vendas/central/KpisVendas";
import { PedidoCatalogoModal } from "@/components/vendas/central/PedidoCatalogoModal";
import { DetalheMarketplaceModal } from "@/components/vendas/central/DetalheMarketplaceModal";
import { VincularAnunciosModal } from "@/components/vendas/central/VincularAnunciosModal";
import { ImportarExportarModal } from "@/components/vendas/central/ImportarExportarModal";
import { ImportarShopeeModal, type LojaMarketplace, type ProdutoMarketplace } from "@/components/vendas/marketplace/ImportarShopeeModal";

export interface VendaItem {
  produto_nome: string;
  produto_sku: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  garantia_dias: number | null;
}

export interface Venda {
  id: string;
  numero: string;
  cliente_id: string | null;
  data_venda: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  status_envio?: StatusEnvio;
  /** 0047. */
  etapa?: EtapaVenda | null;
  logistica?: string | null;
  clientes?: { cidade: string | null; uf: string | null } | null;
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  observacao: string | null;
  venda_itens: VendaItem[];
}

const POR_PAGINA = 40;

const EXTRAS_VAZIOS: FiltrosExtras = {
  pagamento: [],
  logistica: "",
  uf: "",
  valorMin: null,
  valorMax: null,
  soPrejuizo: false,
  soSemCusto: false,
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
  const [etapa, setEtapa] = useState<Etapa | "todos">(() => {
    const c = contarEtapas(lista, { ...FILTROS_VAZIOS, periodo: periodoDoAtalho("hoje") });
    return c.emitir > 0 ? "emitir" : c.imprimir > 0 ? "imprimir" : "todos";
  });
  const [motivo, setMotivo] = useState<MotivoReserva | "todos">("todos");
  const filtrados = useMemo(() => {
    const base = filtrarCentral(lista, filtros, etapa);
    return etapa === "reservar" && motivo !== "todos" ? base.filter((p) => p.motivoReserva === motivo) : base;
  }, [lista, filtros, etapa, motivo]);
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

  // Sincroniza sozinho ao abrir Vendas se alguma loja conectada está há mais de 10 min sem
  // sincronizar (o agendador de 15 min cobre o resto). Em segundo plano, sem travar a tela.
  const router = useRouter();
  const [sincronizandoSozinho, iniciarAuto] = useTransition();
  const jaTentou = useRef(false);
  useEffect(() => {
    if (jaTentou.current || faltandoShopee.length > 0 || marketplace.conexoes.length === 0) return;
    const limite = Date.now() - 10 * 60_000;
    const velha = marketplace.conexoes.some((c) => !c.ultima_sincronizacao || new Date(c.ultima_sincronizacao).getTime() < limite);
    if (!velha) return;
    jaTentou.current = true;
    iniciarAuto(async () => {
      const r = await sincronizarTodasShopee().catch(() => null);
      if (r?.ok && r.dado.novos > 0) toast.success(`${r.dado.novos} pedido(s) novo(s) da Shopee.`);
      if (r?.ok) router.refresh();
    });
  }, [faltandoShopee.length, marketplace.conexoes, router]);

  useEffect(() => {
    if (avisoShopee === "conectada") toast.success("Loja conectada à Shopee.");
    else if (avisoShopee === "erro") toast.error("Não foi possível conectar a loja à Shopee.");
    else if (avisoShopee === "desligada") toast.error("A API da Shopee não está ligada neste servidor.");
  }, [avisoShopee]);

  function mudarEtapa(e: Etapa | "todos") {
    setEtapa(e);
    setMotivo("todos");
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

  function sincronizar() {
    startTransition(async () => {
      const r = await executarComToast(sincronizarTodasShopee(), { erro: "Erro ao sincronizar" });
      if (r.ok) {
        const d = r.dado;
        toast.success(`${d.lojas} loja(s): ${d.pedidos} pedido(s) lido(s), ${d.novos} novo(s).`);
        if (d.erros.length) toast.error(d.erros.join(" · "));
      }
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
    if (p.origem === "marketplace") return [{ label: "Ver detalhes", onClick: () => abrir(p) }];
    if (p.chave.startsWith("catalogo:")) return [{ label: "Abrir pedido", onClick: () => abrir(p) }];
    const v = vendaPorId.get(p.id);
    if (!v) return [];
    if (p.etapa === "cancelado") return [{ label: "Ver detalhes", onClick: () => setDetalhe(v) }];
    const voltar = ANTERIOR[p.etapa];
    return [
      { label: "Ver detalhes", onClick: () => setDetalhe(v) },
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
      subtitulo: `${etapa === "todos" ? "Todas as etapas" : ROTULO_ETAPA[etapa]} · ${rotuloPeriodo(periodo)}`,
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
  const selecionaveis = visiveis.filter((p) => p.editavel && PROXIMA[p.etapa] && p.chave.startsWith("venda:"));
  const lotes = filtrados.filter((p) => selecionados.has(p.chave));
  const proxLote = lotes[0] ? PROXIMA[lotes[0].etapa] : undefined;

  return (
    <>
      <PageHeader
        title="Vendas"
        actions={
          <>
            <Button
              variant="secondary"
              loading={(pending && processando === null) || sincronizandoSozinho}
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SeletorPeriodo valor={periodo} onChange={(p) => (setPeriodo(p), setMostrar(POR_PAGINA))} limiteDias={diasJanela} />
        <FiltroCanais valor={canais} onChange={setCanais} lojas={lojasMarketplace} catalogos={nomesCatalogos} />
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input className={`${inputClass} pl-9`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº do pedido, cliente, produto ou SKU…" aria-label="Buscar pedidos" />
        </div>
        <Button variant={nExtras ? "primary" : "secondary"} onClick={() => setFiltrando(true)}>
          <SlidersHorizontal size={14} /> Filtrar{nExtras ? ` (${nExtras})` : ""}
        </Button>
        {(nExtras > 0 || canais.length > 0 || busca) && (
          <button
            type="button"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
            onClick={() => {
              setCanais([]);
              setBusca("");
              setExtras(EXTRAS_VAZIOS);
            }}
          >
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

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
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "nao_mapeado", "sem_estoque", "revisao"] as const).map((m) => {
                const n = m === "todos" ? filtrarCentral(lista, filtros, "reservar").length : filtrarCentral(lista, filtros, "reservar").filter((p) => p.motivoReserva === m).length;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMotivo(m)}
                    className={`text-xs rounded-md border px-2.5 py-1.5 ${motivo === m ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
                  >
                    {m === "todos" ? "Todos" : ROTULO_MOTIVO[m]} <span className="font-mono">{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {selecionaveis.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="inline-flex items-center gap-2 text-text-secondary">
                <input
                  type="checkbox"
                  checked={selecionaveis.every((p) => selecionados.has(p.chave))}
                  onChange={(e) => setSelecionados(e.target.checked ? new Set(selecionaveis.map((p) => p.chave)) : new Set())}
                />
                Selecionar todos desta página
              </label>
              {lotes.length > 0 && proxLote && (
                <Button size="sm" variant="primary" loading={processando === "massa"} onClick={() => avancar(lotes)}>
                  {proxLote.acao} {lotes.length} pedido(s)
                </Button>
              )}
            </div>
          )}

          {filtrados.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title={etapa === "todos" ? "Nenhum pedido no período" : `Nada em ${ROTULO_ETAPA[etapa]}`}
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
      {filtrando && <FiltrosModal inicial={extras} onAplicar={setExtras} onClose={() => setFiltrando(false)} ufs={ufs} logisticas={logisticas} />}
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
