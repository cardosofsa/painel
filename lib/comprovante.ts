import { formatBRL } from "./format";

export interface ItemComprovante {
  nome: string;
  quantidade: number;
  preco_unitario: number;
}

export interface DadosComprovante {
  numero: string;
  itens: ItemComprovante[];
  subtotal: number;
  desconto: number;
  valorEntrega: number;
  total: number;
  formaPagamento: string | null;
  clienteNome: string | null;
}

/** Texto do comprovante — o mesmo conteúdo tanto pra copiar quanto pra mandar no WhatsApp. */
export function textoComprovante(d: DadosComprovante): string {
  const linhas = [
    `Comprovante — Venda ${d.numero}`,
    "",
    ...d.itens.map((i) => `${i.quantidade}x ${i.nome} — ${formatBRL(i.preco_unitario * i.quantidade)}`),
    "",
    `Subtotal: ${formatBRL(d.subtotal)}`,
  ];
  if (d.desconto > 0) linhas.push(`Desconto: -${formatBRL(d.desconto)}`);
  if (d.valorEntrega > 0) linhas.push(`Entrega: ${formatBRL(d.valorEntrega)}`);
  linhas.push(`Total: ${formatBRL(d.total)}`);
  if (d.formaPagamento) linhas.push(`Pagamento: ${d.formaPagamento}`);
  if (d.clienteNome) linhas.push("", `Cliente: ${d.clienteNome}`);
  return linhas.join("\n");
}

/** Uma parcela (ou, no fiado não parcelado, a dívida inteira como uma "parcela" só). */
export interface ParcelaResumoFiado {
  numero: number;
  totalParcelas: number;
  valor: number;
  status: "pendente" | "paga" | "atrasada";
  dataVencimento: string;
}

/** Dados para a imagem do "Enviar resumo" do box Fiado (0030 — sub-etapa 2.6). */
export interface DadosResumoFiado {
  numero: string;
  clienteNome: string;
  data: string;
  valorTotal: number;
  valorPago: number;
  valorRestante: number;
  parcelas: ParcelaResumoFiado[];
}

/** Mesmo padrão de link usado no Catálogo: com o número do cliente quando disponível,
 * ou o formato sem número (deixa a pessoa escolher o contato na hora de enviar). */
export function linkComprovanteWhatsapp(d: DadosComprovante, whatsappCliente: string | null): string {
  const texto = encodeURIComponent(textoComprovante(d));
  const digitos = whatsappCliente?.replace(/\D/g, "");
  if (digitos) {
    const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
    return `https://wa.me/${numero}?text=${texto}`;
  }
  return `https://wa.me/?text=${texto}`;
}
