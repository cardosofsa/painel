/**
 * Retornos (devoluções/reembolsos) na central de Vendas: os da Shopee (`retornos_marketplace`,
 * 0090) e as devoluções registradas no sistema (`devolucoes`, 0059), numa lista só. Puro; coberto
 * por `retornos.test.ts`.
 *
 * Em qual sub-aba cada retorno da Shopee cai é decidido AQUI, na leitura, a partir do status e do
 * rastreio guardados. O mapa é a melhor leitura da API da Shopee e precisa ser conferido com
 * devoluções reais: o chip de cada cartão mostra o status original da plataforma para isso.
 * Ajustar é mudar `subabaDoRetorno` — sem migração e sem nova sincronização.
 */

export type SubabaRetorno = "todos" | "em_analise" | "em_devolucao" | "aprovadas" | "em_disputa" | "canceladas";

export const SUBABAS_RETORNO: { id: SubabaRetorno; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "em_analise", rotulo: "Em análise pela Shopee" },
  { id: "em_devolucao", rotulo: "Em devolução" },
  { id: "aprovadas", rotulo: "Aprovadas" },
  { id: "em_disputa", rotulo: "Em disputa" },
  { id: "canceladas", rotulo: "Canceladas" },
];

export interface RetornoCentral {
  id: string;
  origem: "shopee" | "sistema";
  loja: string | null;
  numeroPedido: string | null;
  /** Número do retorno (Shopee) ou da devolução (sistema). */
  referencia: string;
  /** Status original da plataforma (ou o tipo da devolução do sistema). */
  status: string;
  statusRotulo: string;
  subaba: Exclude<SubabaRetorno, "todos">;
  motivo: string | null;
  valor: number;
  comprador: string | null;
  rastreio: string | null;
  /** ISO. */
  criadoEm: string | null;
  /** Até quando o vendedor pode responder (ISO), quando a Shopee informa. */
  prazoResposta: string | null;
  itens: { nome: string; quantidade: number }[];
}

/**
 * Status da Shopee → sub-aba. REQUESTED (cliente pediu) e JUDGING (a Shopee decide) ficam em
 * análise; ACCEPTED com rastreio e PROCESSING estão em devolução; ACCEPTED sem rastreio e CLOSED
 * foram aprovadas; SELLER_DISPUTE é disputa; CANCELLED, cancelada. Status novo/desconhecido vai
 * para "em análise" (e continua em Todos).
 */
export function subabaDoRetorno(status: string, rastreio: string | null): Exclude<SubabaRetorno, "todos"> {
  switch (status.toUpperCase()) {
    case "ACCEPTED":
      return rastreio ? "em_devolucao" : "aprovadas";
    case "PROCESSING":
      return "em_devolucao";
    case "CLOSED":
      return "aprovadas";
    case "SELLER_DISPUTE":
      return "em_disputa";
    case "CANCELLED":
      return "canceladas";
    default:
      return "em_analise";
  }
}

const ROTULO_STATUS: Record<string, string> = {
  REQUESTED: "Solicitado",
  JUDGING: "Em análise",
  ACCEPTED: "Aceito",
  PROCESSING: "Em processamento",
  CLOSED: "Encerrado",
  SELLER_DISPUTE: "Em disputa",
  CANCELLED: "Cancelado",
};

/** Texto do chip: o rótulo em português com o status original da Shopee ao lado. */
export function rotuloStatusShopee(status: string): string {
  const base = ROTULO_STATUS[status.toUpperCase()];
  return base ? `${base} · ${status}` : status;
}

/** Linha de `retornos_marketplace` → cartão. `lojas`: nome por id da loja. */
export function retornoDeLinhaShopee(l: Record<string, unknown>, lojas: Map<string, string>): RetornoCentral {
  const status = String(l.status ?? "");
  const rastreio = typeof l.rastreio === "string" && l.rastreio ? l.rastreio : null;
  const itens = Array.isArray(l.itens) ? l.itens : [];
  return {
    id: `shopee:${String(l.id)}`,
    origem: "shopee",
    loja: lojas.get(String(l.loja_id)) ?? null,
    numeroPedido: (l.numero_pedido as string | null) ?? null,
    referencia: String(l.return_sn ?? ""),
    status,
    statusRotulo: rotuloStatusShopee(status),
    subaba: subabaDoRetorno(status, rastreio),
    motivo: (l.motivo as string | null) ?? null,
    valor: Number(l.valor_reembolso ?? 0),
    comprador: (l.comprador as string | null) ?? null,
    rastreio,
    criadoEm: (l.criado_em_plataforma as string | null) ?? null,
    prazoResposta: (l.prazo_resposta as string | null) ?? null,
    itens: itens
      .filter((i): i is { nome: string; quantidade?: number } => !!i && typeof (i as { nome?: unknown }).nome === "string")
      .map((i) => ({ nome: i.nome, quantidade: Number(i.quantidade ?? 1) })),
  };
}

const FORMA: Record<string, string> = { reembolso: "reembolso", abater: "abatido do fiado", troca: "troca", nenhum: "sem reembolso" };

/** Linha de `devolucoes` (+ `vendas`) → cartão. A devolução do sistema já foi decidida pelo dono: vai em "Aprovadas". */
export function retornoDeDevolucaoSistema(l: Record<string, unknown>): RetornoCentral {
  const venda = (l.vendas && typeof l.vendas === "object" ? l.vendas : {}) as { numero?: string; cliente_nome?: string | null };
  const tipo = l.tipo === "troca" ? "Troca" : "Devolução";
  return {
    id: `sistema:${String(l.id)}`,
    origem: "sistema",
    loja: null,
    numeroPedido: venda.numero ?? null,
    referencia: String(l.numero ?? ""),
    status: tipo,
    statusRotulo: `${tipo} · ${FORMA[String(l.forma)] ?? String(l.forma ?? "")}`.replace(/ · $/, ""),
    subaba: "aprovadas",
    motivo: (l.motivo as string | null) ?? null,
    valor: Number(l.valor_estorno ?? 0),
    comprador: venda.cliente_nome ?? null,
    rastreio: null,
    criadoEm: (l.criado_em as string | null) ?? null,
    prazoResposta: null,
    itens: [],
  };
}

/** Mais recentes primeiro; sem data vai para o fim. */
export function ordenarRetornos(lista: RetornoCentral[]): RetornoCentral[] {
  return [...lista].sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""));
}

export function contarSubabas(lista: RetornoCentral[]): Record<SubabaRetorno, number> {
  const c: Record<SubabaRetorno, number> = { todos: lista.length, em_analise: 0, em_devolucao: 0, aprovadas: 0, em_disputa: 0, canceladas: 0 };
  for (const r of lista) c[r.subaba]++;
  return c;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Sub-aba + busca (número do retorno/pedido, comprador, motivo, produto). */
export function filtrarRetornos(lista: RetornoCentral[], subaba: SubabaRetorno, busca: string): RetornoCentral[] {
  const termo = semAcento(busca.trim());
  return lista.filter((r) => {
    if (subaba !== "todos" && r.subaba !== subaba) return false;
    if (!termo) return true;
    return semAcento([r.referencia, r.numeroPedido, r.comprador, r.motivo, r.loja, ...r.itens.map((i) => i.nome)].filter(Boolean).join(" ")).includes(termo);
  });
}

/** Dias até o prazo de resposta (negativo = vencido); `null` sem prazo. `hoje` AAAA-MM-DD. */
export function diasParaResponder(prazo: string | null, hoje: string): number | null {
  if (!prazo) return null;
  const dia = new Date(prazo).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = dia.split("-").map(Number);
  const [a2, m2, d2] = hoje.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a2, m2 - 1, d2)) / 86_400_000);
}
