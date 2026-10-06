/**
 * Central de pedidos (Vendas): vendas do PDV/catálogo, pedidos do catálogo ainda não
 * confirmados e pedidos de marketplace numa lista só, com a mesma etapa de expedição.
 * PURO, coberto por `pedidos-central.test.ts`.
 *
 * Etapas (como no ERP): Para Reservar (problema: não mapeado / sem estoque) → Para Emitir
 * (aprovar) → Para Enviar → Para Imprimir (aqui a reserva vira baixa, 0052) → Para
 * Retirada → Enviado → Concluído; à parte, Aguardando pagamento e Cancelado.
 * - Venda do sistema: a etapa é `vendas.etapa`; sem a migração, sai do `status_envio`.
 * - Pedido do catálogo a confirmar: Para Emitir (Aprovar abre o fechamento da venda), ou
 *   Para Reservar se algum item não existe mais ou o disponível não cobre.
 * - Marketplace: a etapa sai do status da plataforma e NÃO é editada aqui.
 */

import { noPeriodo, type Periodo } from "@/lib/periodo";
import type { StatusMarketplace } from "@/lib/marketplace/shopee-planilha";

export type Etapa = "pagamento" | "reservar" | "emitir" | "enviar" | "imprimir" | "retirada" | "enviado" | "concluido" | "cancelado";
/** Por que o pedido está em Para Reservar (sub-abas). */
export type MotivoReserva = "nao_mapeado" | "sem_estoque" | "revisao";
export type EtapaVenda = Exclude<Etapa, "pagamento" | "cancelado">;

export const ETAPAS: { id: Etapa; rotulo: string; pendente: boolean }[] = [
  { id: "pagamento", rotulo: "Aguardando pagamento", pendente: true },
  { id: "reservar", rotulo: "Para Reservar", pendente: true },
  { id: "emitir", rotulo: "Para Emitir", pendente: true },
  { id: "enviar", rotulo: "Para Enviar", pendente: true },
  { id: "imprimir", rotulo: "Para Imprimir", pendente: true },
  { id: "retirada", rotulo: "Para Retirada", pendente: true },
  { id: "enviado", rotulo: "Enviado", pendente: false },
  { id: "concluido", rotulo: "Concluído", pendente: false },
  { id: "cancelado", rotulo: "Cancelado", pendente: false },
];

export const ROTULO_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.rotulo])) as Record<Etapa, string>;

/** Próxima etapa e o nome da ação que leva até ela (só pedidos do próprio sistema). */
export const PROXIMA: Partial<Record<Etapa, { etapa: EtapaVenda; acao: string }>> = {
  reservar: { etapa: "enviar", acao: "Reservar" },
  emitir: { etapa: "enviar", acao: "Aprovar" },
  enviar: { etapa: "imprimir", acao: "Programar envio" },
  imprimir: { etapa: "retirada", acao: "Imprimir" },
  retirada: { etapa: "enviado", acao: "Marcar como enviado" },
  enviado: { etapa: "concluido", acao: "Marcar entregue" },
};

/** Etapa anterior (para "Retornar para…"). */
export const ANTERIOR: Partial<Record<Etapa, EtapaVenda>> = {
  enviar: "emitir",
  imprimir: "enviar",
  retirada: "imprimir",
  enviado: "retirada",
  concluido: "enviado",
};

export const ROTULO_MOTIVO: Record<MotivoReserva, string> = {
  nao_mapeado: "Não mapeado",
  sem_estoque: "Sem estoque",
  revisao: "Pendente revisão",
};

export const LOGISTICAS = ["Retirada", "Entrega própria", "Motoboy", "Correios", "Transportadora"] as const;

export type OrigemCentral = "pdv" | "catalogo" | "marketplace";
export type Pagamento = "pago" | "fiado" | "pendente" | "cancelado";

export interface ItemCentral {
  nome: string;
  sku: string | null;
  quantidade: number;
  preco: number;
}

export interface PedidoCentral {
  /** Única na lista: "venda:<id>", "catalogo:<id>", "mkt:<id>". */
  chave: string;
  origem: OrigemCentral;
  id: string;
  numero: string;
  /** Nº na plataforma (marketplace) ou do pedido do catálogo que originou a venda. */
  numeroExterno: string | null;
  data: string;
  pagoEm: string | null;
  cliente: string | null;
  cidade: string | null;
  uf: string | null;
  /** Nome do canal ("PDV", "Catálogo", "Shopee"...) e da loja (marketplace). */
  canal: string;
  loja: string | null;
  lojaId: string | null;
  itens: ItemCentral[];
  total: number;
  custo: number;
  /** Taxas da plataforma (marketplace); 0 nas vendas do sistema. */
  taxas: number;
  lucro: number;
  etapa: Etapa;
  pagamento: Pagamento;
  formaPagamento: string | null;
  logistica: string | null;
  /** Logística definida pela plataforma: não se edita aqui. */
  logisticaFixa: boolean;
  prazoEnvio: string | null;
  /** Algum item sem produto vinculado (custo desconhecido). */
  semCusto: boolean;
  /** Só em Para Reservar: o motivo (sub-aba). */
  motivoReserva: MotivoReserva | null;
  /** 0053: anotações da equipe. Pedido oculto sai das etapas e fica em "Oculto". */
  tags: string[];
  observacaoInterna: string | null;
  oculto: boolean;
  /** A etapa pode ser avançada aqui (pedidos do próprio sistema). */
  editavel: boolean;
  /** Marketplace (0054): envio programado pelo Sertão, falha, rastreio e etiqueta baixada. */
  envio?: { programado: boolean; erro: string | null; rastreio: string | null; impressa: boolean };
}

export type SubEnvio = "programar" | "programando" | "falha";
export const ROTULO_SUB_ENVIO: Record<SubEnvio, string> = { programar: "Para programar", programando: "Programando", falha: "Falha" };

/**
 * Sub-aba de Para Enviar (como no ERP): falha ao programar, já programado ou a programar.
 * Venda do sistema não tem `envio` e cai em "programar" (ela sai de Para Enviar ao programar).
 */
export function subEnvio(p: Pick<PedidoCentral, "envio">): SubEnvio {
  if (p.envio?.erro) return "falha";
  return p.envio?.programado ? "programando" : "programar";
}

// ---------- Entradas (o que as páginas já carregam) ----------

export interface VendaIn {
  id: string;
  numero: string;
  data_venda: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  status_envio?: "separacao" | "enviado" | "concluido" | null;
  etapa?: EtapaVenda | null;
  logistica?: string | null;
  /** 0052: false = ainda só reservado (baixa ao passar para Imprimir). */
  estoque_baixado?: boolean;
  /** 0053. */
  tags?: string[] | null;
  observacao_interna?: string | null;
  ocultado_em?: string | null;
  total: number;
  custo_total: number;
  lucro: number;
  observacao: string | null;
  clientes?: { cidade: string | null; uf: string | null } | null;
  venda_itens: { produto_nome: string; produto_sku: string | null; quantidade: number; preco_unitario: number }[];
}

export interface PedidoCatalogoIn {
  id: string;
  numero: string;
  /** De qual catálogo veio (há contas com vários). */
  catalogo_nome?: string | null;
  cliente_nome: string;
  total: number;
  status: "pendente" | "aceito" | "recusado" | "convertido";
  criado_em: string;
  venda_id: string | null;
  entrega_cidade?: string | null;
  entrega_uf?: string | null;
  itens: { produto_id?: string | null; produto_nome: string; quantidade: number; preco_unitario: number }[];
}

export interface PedidoMktIn {
  id: string;
  loja_id: string;
  numero: string;
  status: StatusMarketplace;
  status_original: string | null;
  criado_em_plataforma: string | null;
  pago_em: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  subtotal: number;
  cupom_vendedor: number;
  comissao: number;
  taxa_servico: number;
  taxa_transacao: number;
  custo: number;
  lucro: number;
  custo_incompleto: boolean;
  logistica?: string | null;
  prazo_envio?: string | null;
  /** 0053. */
  tags?: string[] | null;
  observacao_interna?: string | null;
  ocultado_em?: string | null;
  /** 0054. */
  rastreio?: string | null;
  envio_programado_em?: string | null;
  envio_erro?: string | null;
  etiqueta_impressa_em?: string | null;
  pedidos_marketplace_itens: { sku: string | null; nome: string; variacao: string | null; quantidade: number; preco_unitario: number }[];
}

export interface LojaIn {
  id: string;
  nome: string;
  canalNome: string;
}

// ---------- Etapas ----------

export function etapaDaVenda(v: Pick<VendaIn, "status" | "etapa" | "status_envio">): Etapa {
  if (v.status === "cancelada") return "cancelado";
  if (v.etapa) return v.etapa;
  // Sem a 0047: deduz do status_envio (sem envio = balcão, já concluída).
  if (v.status_envio === "separacao") return "enviar";
  if (v.status_envio === "enviado") return "enviado";
  return "concluido";
}

/** Status da Shopee → etapa. A enviar = Para Enviar (programar); PROCESSED (etiqueta pronta) = Para Imprimir. */
export function etapaDoMarketplace(status: StatusMarketplace, original: string | null): Etapa {
  switch (status) {
    case "nao_pago":
      return "pagamento";
    case "a_enviar": {
      const o = (original ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      // Mercado Livre (10.8): etiqueta já impressa na plataforma = pronto para a coleta.
      if (/printed/.test(o)) return "retirada";
      return /processed|processado|retry_ship/.test(o) ? "imprimir" : "enviar";
    }
    case "enviado":
      return "enviado";
    case "concluido":
      return "concluido";
    default:
      return "cancelado";
  }
}

// ---------- Montagem ----------

export function montarCentral(entrada: {
  vendas: VendaIn[];
  pedidosCatalogo: PedidoCatalogoIn[];
  marketplace: PedidoMktIn[];
  lojas: LojaIn[];
  /** produto → disponível (0052). Sem ele, não dá para saber "sem estoque" antes de aprovar. */
  disponivel?: Map<string, number>;
}): PedidoCentral[] {
  const lojas = new Map(entrada.lojas.map((l) => [l.id, l]));
  const vendaDoCatalogo = new Map(entrada.pedidosCatalogo.filter((p) => p.venda_id).map((p) => [p.venda_id as string, p]));
  const lista: PedidoCentral[] = [];

  for (const v of entrada.vendas) {
    const ped = vendaDoCatalogo.get(v.id);
    const catalogo = !!ped || (v.observacao ?? "").startsWith("Pedido da vitrine");
    const etapa = etapaDaVenda(v);
    lista.push({
      chave: `venda:${v.id}`,
      origem: catalogo ? "catalogo" : "pdv",
      id: v.id,
      numero: v.numero,
      numeroExterno: ped?.numero ?? null,
      data: v.data_venda,
      pagoEm: v.status === "paga" ? v.data_venda : null,
      cliente: v.cliente_nome,
      cidade: v.clientes?.cidade ?? ped?.entrega_cidade ?? null,
      uf: (v.clientes?.uf ?? ped?.entrega_uf ?? null)?.toUpperCase() ?? null,
      canal: catalogo ? "Catálogo" : "PDV",
      loja: catalogo ? (ped?.catalogo_nome ?? null) : null,
      lojaId: null,
      itens: v.venda_itens.map((i) => ({ nome: i.produto_nome, sku: i.produto_sku, quantidade: i.quantidade, preco: Number(i.preco_unitario) })),
      total: Number(v.total),
      custo: Number(v.custo_total),
      taxas: 0,
      lucro: Number(v.lucro),
      etapa,
      pagamento: v.status === "cancelada" ? "cancelado" : v.status === "fiado" ? "fiado" : "pago",
      formaPagamento: v.forma_pagamento,
      logistica: v.logistica ?? null,
      logisticaFixa: false,
      prazoEnvio: null,
      semCusto: false,
      motivoReserva: etapa === "reservar" ? "sem_estoque" : null,
      tags: v.tags ?? [],
      observacaoInterna: v.observacao_interna ?? null,
      oculto: !!v.ocultado_em,
      editavel: etapa !== "cancelado",
    });
  }

  for (const p of entrada.pedidosCatalogo) {
    if (p.status !== "pendente" && p.status !== "aceito") continue;
    const motivo = motivoDoPedidoCatalogo(p, entrada.disponivel);
    lista.push({
      chave: `catalogo:${p.id}`,
      origem: "catalogo",
      id: p.id,
      numero: p.numero,
      numeroExterno: null,
      data: p.criado_em,
      pagoEm: null,
      cliente: p.cliente_nome,
      cidade: p.entrega_cidade ?? null,
      uf: p.entrega_uf?.toUpperCase() ?? null,
      canal: "Catálogo",
      loja: p.catalogo_nome ?? null,
      lojaId: null,
      itens: p.itens.map((i) => ({ nome: i.produto_nome, sku: null, quantidade: i.quantidade, preco: Number(i.preco_unitario) })),
      total: Number(p.total),
      custo: 0,
      taxas: 0,
      lucro: 0,
      etapa: motivo ? "reservar" : "emitir",
      pagamento: "pendente",
      formaPagamento: null,
      logistica: null,
      logisticaFixa: false,
      prazoEnvio: null,
      semCusto: false,
      motivoReserva: motivo,
      tags: [],
      observacaoInterna: null,
      oculto: false,
      editavel: true,
    });
  }

  for (const p of entrada.marketplace) {
    const loja = lojas.get(p.loja_id);
    const etapaPlataforma = etapaDoMarketplace(p.status, p.status_original);
    // Item sem produto antes de baixar: vai para Para Reservar (Não mapeado) até vincular.
    const naoMapeado = p.custo_incompleto && etapaPlataforma === "enviar";
    // Etiqueta já baixada pelo Sertão (0054): pronto, esperando a coleta.
    const etapa: Etapa = naoMapeado ? "reservar" : etapaPlataforma === "imprimir" && p.etiqueta_impressa_em ? "retirada" : etapaPlataforma;
    const cancelado = etapa === "cancelado";
    lista.push({
      chave: `mkt:${p.id}`,
      origem: "marketplace",
      id: p.id,
      numero: p.numero,
      numeroExterno: p.numero,
      data: p.criado_em_plataforma ?? p.pago_em ?? new Date(0).toISOString(),
      pagoEm: p.pago_em,
      cliente: p.comprador,
      cidade: p.cidade,
      uf: p.uf,
      canal: loja?.canalNome || "Marketplace",
      loja: loja?.nome ?? null,
      lojaId: p.loja_id,
      itens: p.pedidos_marketplace_itens.map((i) => ({ nome: i.variacao ? `${i.nome} · ${i.variacao}` : i.nome, sku: i.sku, quantidade: i.quantidade, preco: Number(i.preco_unitario) })),
      total: Number(p.subtotal),
      custo: cancelado ? 0 : Number(p.custo),
      taxas: cancelado ? 0 : Number(p.comissao) + Number(p.taxa_servico) + Number(p.taxa_transacao) + Number(p.cupom_vendedor),
      lucro: cancelado ? 0 : Number(p.lucro),
      etapa,
      pagamento: cancelado ? "cancelado" : p.pago_em || etapa !== "pagamento" ? "pago" : "pendente",
      formaPagamento: null,
      logistica: p.logistica ?? null,
      logisticaFixa: true,
      prazoEnvio: p.prazo_envio ?? null,
      semCusto: !cancelado && p.custo_incompleto,
      motivoReserva: naoMapeado ? "nao_mapeado" : null,
      tags: p.tags ?? [],
      observacaoInterna: p.observacao_interna ?? null,
      oculto: !!p.ocultado_em,
      editavel: false,
      envio: { programado: !!p.envio_programado_em, erro: p.envio_erro ?? null, rastreio: p.rastreio ?? null, impressa: !!p.etiqueta_impressa_em },
    });
  }

  return lista.sort((a, b) => b.data.localeCompare(a.data));
}

/** Pedido do catálogo ainda não aprovado tem problema? (item apagado, ou falta disponível). */
export function motivoDoPedidoCatalogo(p: Pick<PedidoCatalogoIn, "itens">, disponivel?: Map<string, number>): MotivoReserva | null {
  if (p.itens.some((i) => i.produto_id === null)) return "nao_mapeado";
  if (!disponivel) return null;
  const pedido = new Map<string, number>();
  for (const i of p.itens) if (i.produto_id) pedido.set(i.produto_id, (pedido.get(i.produto_id) ?? 0) + i.quantidade);
  for (const [id, qtd] of pedido) {
    const d = disponivel.get(id);
    if (d !== undefined && d < qtd) return "sem_estoque";
  }
  return null;
}

// ---------- Filtros ----------

export interface FiltrosCentral {
  periodo: Periodo;
  /** Vazio = todos. Valores: "pdv", "catalogo" ou "loja:<id>". */
  canais: string[];
  busca: string;
  pagamento: Pagamento[];
  logistica: string;
  uf: string;
  valorMin: number | null;
  valorMax: number | null;
  soPrejuizo: boolean;
  soSemCusto: boolean;
  /** Só pedidos com esta tag (0053). */
  tag: string;
}

export const FILTROS_VAZIOS: Omit<FiltrosCentral, "periodo"> = {
  canais: [],
  busca: "",
  pagamento: [],
  logistica: "",
  uf: "",
  valorMin: null,
  valorMax: null,
  soPrejuizo: false,
  soSemCusto: false,
  tag: "",
};

/** Chave do filtro de canais: "pdv", "catalogo:<nome>" (ou "catalogo") e "loja:<id>". */
export function chaveCanal(p: Pick<PedidoCentral, "origem" | "lojaId" | "loja">): string {
  if (p.origem === "marketplace") return `loja:${p.lojaId}`;
  if (p.origem === "catalogo") return p.loja ? `catalogo:${p.loja}` : "catalogo";
  return p.origem;
}

function passaCanal(p: PedidoCentral, canais: string[]): boolean {
  if (!canais.length) return true;
  const k = chaveCanal(p);
  // "catalogo" (o grupo inteiro) cobre todos os catálogos.
  return canais.includes(k) || (p.origem === "catalogo" && canais.includes("catalogo"));
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Filtros que NÃO dependem da etapa nem do período. */
function passaFiltros(p: PedidoCentral, f: FiltrosCentral): boolean {
  if (!passaCanal(p, f.canais)) return false;
  if (f.pagamento.length && !f.pagamento.includes(p.pagamento)) return false;
  if (f.logistica && normal(p.logistica ?? "") !== normal(f.logistica)) return false;
  if (f.uf && (p.uf ?? "") !== f.uf.toUpperCase()) return false;
  if (f.valorMin != null && p.total < f.valorMin) return false;
  if (f.valorMax != null && p.total > f.valorMax) return false;
  if (f.soPrejuizo && !(p.lucro < 0)) return false;
  if (f.soSemCusto && !p.semCusto) return false;
  if (f.tag && !p.tags.some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
  const t = normal(f.busca.trim());
  if (t) {
    const alvo = normal([p.numero, p.numeroExterno, p.cliente, p.loja, ...p.itens.flatMap((i) => [i.nome, i.sku])].filter(Boolean).join(" "));
    if (!alvo.includes(t)) return false;
  }
  return true;
}

const PENDENTES = new Set<Etapa>(ETAPAS.filter((e) => e.pendente).map((e) => e.id));

/**
 * Trabalho pendente (Aguardando pagamento, Emitir, Imprimir, Enviar) aparece de QUALQUER
 * data — senão um pedido de anteontem sumiria da fila ao olhar "Hoje". O resto respeita
 * o período.
 */
function noRecorte(p: PedidoCentral, f: FiltrosCentral): boolean {
  return PENDENTES.has(p.etapa) || noPeriodo(p.data, f.periodo);
}

/** "oculto" lista só os ocultos (de qualquer data); as outras abas nunca mostram oculto. */
export function filtrarCentral(lista: PedidoCentral[], f: FiltrosCentral, etapa: Etapa | "todos" | "oculto"): PedidoCentral[] {
  if (etapa === "oculto") return lista.filter((p) => p.oculto && passaFiltros(p, f));
  return lista.filter((p) => !p.oculto && (etapa === "todos" || p.etapa === etapa) && noRecorte(p, f) && passaFiltros(p, f));
}

export function contarEtapas(lista: PedidoCentral[], f: FiltrosCentral): Record<Etapa | "todos" | "oculto", number> {
  const c = Object.fromEntries([...ETAPAS.map((e) => [e.id, 0]), ["todos", 0], ["oculto", 0]]) as Record<Etapa | "todos" | "oculto", number>;
  for (const p of lista) {
    if (!passaFiltros(p, f)) continue;
    if (p.oculto) {
      c.oculto++;
      continue;
    }
    if (!noRecorte(p, f)) continue;
    c[p.etapa]++;
    c.todos++;
  }
  return c;
}

/** Tags em uso (opções do filtro). */
export function tagsEmUso(lista: PedidoCentral[]): string[] {
  const m = new Map<string, string>();
  for (const p of lista) for (const t of p.tags) if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
  return [...m.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Indicadores do período (só pedidos válidos: sem cancelados e sem pedido a confirmar). */
export function indicadores(lista: PedidoCentral[], f: FiltrosCentral) {
  const validos = lista.filter((p) => !p.oculto && p.etapa !== "cancelado" && p.etapa !== "pagamento" && !p.chave.startsWith("catalogo:") && noPeriodo(p.data, f.periodo) && passaFiltros(p, f));
  const valor = validos.reduce((s, p) => s + p.total, 0);
  const lucro = validos.reduce((s, p) => s + p.lucro, 0);
  return { pedidos: validos.length, valor, lucro, margem: valor > 0 ? lucro / valor : 0, ticket: validos.length ? valor / validos.length : 0 };
}

/** UFs e logísticas presentes (opções dos filtros). */
export function opcoesFiltro(lista: PedidoCentral[]) {
  const ufs = [...new Set(lista.map((p) => p.uf).filter((u): u is string => !!u))].sort();
  const logisticas = [...new Set([...LOGISTICAS, ...lista.map((p) => p.logistica).filter((l): l is string => !!l)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { ufs, logisticas };
}
