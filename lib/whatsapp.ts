/**
 * WhatsApp semi-automático (11.6): textos prontos e o link wa.me. Puro, coberto por
 * `whatsapp.test.ts`. Nada é enviado sozinho: a pessoa clica e o WhatsApp dela abre com o
 * texto (grátis, sem API, sem risco de bloqueio do número).
 */

import { formatBRL } from "./format";

/** wa.me com DDI do Brasil quando faltar. Sem número, abre para escolher o contato. */
export function linkWhatsapp(numero: string | null | undefined, texto: string): string {
  const d = (numero ?? "").replace(/\D/g, "");
  const base = d ? `https://wa.me/${d.startsWith("55") && d.length >= 12 ? d : `55${d}`}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

const primeiroNome = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] || "";
const ola = (nome: string | null | undefined) => (primeiroNome(nome) ? `Oi, ${primeiroNome(nome)}!` : "Oi!");
const dataBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

export type AssuntoMensagem = "pedido" | "pago" | "enviado" | "fiado";

export const ROTULO_ASSUNTO: Record<AssuntoMensagem, string> = {
  pedido: "Pedido recebido",
  pago: "Pagamento confirmado",
  enviado: "Enviado",
  fiado: "Crediário",
};

export interface MensagemPendente {
  chave: string;
  assunto: AssuntoMensagem;
  cliente: string;
  whatsapp: string;
  texto: string;
  /** ISO, para ordenar. */
  quando: string;
  referencia: string;
}

export function textoPedidoRecebido(p: { nome: string | null; numero: string; total: number; loja: string }): string {
  return `${ola(p.nome)} Recebemos seu pedido ${p.numero} (${formatBRL(p.total)}) na ${p.loja}. Já vamos conferir e te confirmamos por aqui. 😊`;
}

export function textoPagamentoConfirmado(p: { nome: string | null; numero: string; total: number; loja: string }): string {
  return `${ola(p.nome)} Pagamento do pedido ${p.numero} (${formatBRL(p.total)}) confirmado na ${p.loja}. Já estamos separando tudo. Obrigado pela compra!`;
}

export function textoEnviado(p: { nome: string | null; numero: string; loja: string; rastreio: string | null; logistica: string | null }): string {
  const como = p.logistica ? ` por ${p.logistica}` : "";
  const rastreio = p.rastreio ? ` Código de rastreio: ${p.rastreio}.` : "";
  return `${ola(p.nome)} Seu pedido ${p.numero} da ${p.loja} saiu para entrega${como}.${rastreio} Qualquer coisa, é só chamar.`;
}

export function textoFiado(p: { nome: string | null; valor: number; vencimento: string; loja: string; vencido: boolean; parcela?: string | null }): string {
  const qual = p.parcela ? `a parcela ${p.parcela}` : "o valor";
  return p.vencido
    ? `${ola(p.nome)} Passando para lembrar que ${qual} de ${formatBRL(p.valor)} na ${p.loja} venceu em ${dataBR(p.vencimento)}. Consegue acertar? Se já pagou, desconsidere. 🙏`
    : `${ola(p.nome)} Lembrete amigo: ${qual} de ${formatBRL(p.valor)} na ${p.loja} vence em ${dataBR(p.vencimento)}. Qualquer dúvida, estou por aqui!`;
}

export interface EntradaMensagens {
  loja: string;
  hoje: string;
  pedidosCatalogo: { id: string; numero: string; cliente_nome: string; cliente_whatsapp: string; total: number; status: string; criado_em: string; venda_id: string | null }[];
  vendas: { id: string; numero: string; cliente: string | null; whatsapp: string | null; total: number; etapa: string | null; status: string; rastreio: string | null; logistica: string | null; data: string; doCatalogo: boolean }[];
  parcelas: { id: string; venda_numero: string; cliente: string | null; whatsapp: string | null; valor: number; vencimento: string; numero: number; total_parcelas: number }[];
}

/** O que mandar agora, menos o que já foi enviado (chave). Mais recente primeiro. */
export function mensagensPendentes(e: EntradaMensagens, enviadas: Set<string>): MensagemPendente[] {
  const saida: MensagemPendente[] = [];
  const add = (m: MensagemPendente) => {
    if (m.whatsapp.replace(/\D/g, "").length >= 10 && !enviadas.has(m.chave)) saida.push(m);
  };
  for (const p of e.pedidosCatalogo) {
    if (p.status !== "pendente") continue;
    add({ chave: `pedido:${p.id}`, assunto: "pedido", cliente: p.cliente_nome, whatsapp: p.cliente_whatsapp, quando: p.criado_em, referencia: p.numero, texto: textoPedidoRecebido({ nome: p.cliente_nome, numero: p.numero, total: p.total, loja: e.loja }) });
  }
  for (const v of e.vendas) {
    if (v.status === "cancelada" || !v.whatsapp) continue;
    if (v.etapa === "enviado")
      add({ chave: `enviado:${v.id}`, assunto: "enviado", cliente: v.cliente ?? "", whatsapp: v.whatsapp, quando: v.data, referencia: v.numero, texto: textoEnviado({ nome: v.cliente, numero: v.numero, loja: e.loja, rastreio: v.rastreio, logistica: v.logistica }) });
    else if (v.doCatalogo && v.status === "paga" && v.etapa !== "concluido")
      add({ chave: `pago:${v.id}`, assunto: "pago", cliente: v.cliente ?? "", whatsapp: v.whatsapp, quando: v.data, referencia: v.numero, texto: textoPagamentoConfirmado({ nome: v.cliente, numero: v.numero, total: v.total, loja: e.loja }) });
  }
  const amanha = new Date(`${e.hoje}T12:00:00`);
  amanha.setDate(amanha.getDate() + 2);
  const limite = amanha.toISOString().slice(0, 10);
  for (const p of e.parcelas) {
    if (!p.whatsapp || p.vencimento > limite) continue;
    const vencido = p.vencimento < e.hoje;
    add({
      chave: `fiado:${p.id}:${vencido ? "vencido" : "vence"}`,
      assunto: "fiado",
      cliente: p.cliente ?? "",
      whatsapp: p.whatsapp,
      quando: p.vencimento,
      referencia: p.venda_numero,
      texto: textoFiado({ nome: p.cliente, valor: p.valor, vencimento: p.vencimento, loja: e.loja, vencido, parcela: p.total_parcelas > 1 ? `${p.numero}/${p.total_parcelas}` : null }),
    });
  }
  return saida.sort((a, b) => b.quando.localeCompare(a.quando));
}

export interface ResumoDia {
  data: string;
  vendas: number;
  faturamento: number;
  lucro: number;
  parados: { etapa: string; n: number }[];
  acabando: string[];
  aReceberHoje: number;
}

/** Texto do fechamento do dia para o dono mandar para si mesmo. */
export function textoResumoDia(r: ResumoDia, loja: string): string {
  const linhas = [
    `📊 Resumo de ${dataBR(r.data)} · ${loja}`,
    "",
    `Vendas: ${r.vendas} · ${formatBRL(r.faturamento)}`,
    `Lucro: ${formatBRL(r.lucro)}${r.faturamento > 0 ? ` (${((r.lucro / r.faturamento) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}`,
  ];
  if (r.aReceberHoje > 0) linhas.push(`A receber hoje: ${formatBRL(r.aReceberHoje)}`);
  const parados = r.parados.filter((p) => p.n > 0);
  if (parados.length) linhas.push("", "Pedidos esperando:", ...parados.map((p) => `• ${p.etapa}: ${p.n}`));
  if (r.acabando.length) linhas.push("", "Acabando no estoque:", ...r.acabando.slice(0, 8).map((n) => `• ${n}`));
  return linhas.join("\n");
}
