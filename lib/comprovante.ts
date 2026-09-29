import { formatBRL, formatarDataIso } from "./format";

export interface ItemComprovante {
  nome: string;
  quantidade: number;
  preco_unitario: number;
  /** null/ausente = sem garantia. Só aparece no comprovante quando algum item tiver. */
  garantia_dias?: number | null;
}

/** Cabeçalho do comprovante (perfil_negocio, migração 0032). Tudo opcional. */
export interface EmpresaComprovante {
  nome: string | null;
  cnpj: string | null;
  logoUrl: string | null;
  telefone: string | null;
  email: string | null;
  instagram: string | null;
  enderecoLinha: string | null;
}

export interface ClienteComprovante {
  nome: string;
  whatsapp: string | null;
  email: string | null;
  enderecoLinha: string | null;
}

/** Como a venda foi paga. Só o que existir vira linha no comprovante. */
export interface PagamentoComprovante {
  entradaValor: number;
  entradaForma: string | null;
  formaPagamento2: string | null;
  parcelasCartao: number | null;
  taxaMaquinetaPct: number;
  taxaMaquinetaValor: number;
}

/** Uma parcela (ou, no fiado não parcelado, a dívida inteira como uma "parcela" só). */
export interface ParcelaResumoFiado {
  numero: number;
  totalParcelas: number;
  valor: number;
  status: "pendente" | "paga" | "atrasada";
  dataVencimento: string;
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
  /** Os campos abaixo são preenchidos pelo carregador do servidor; o PDV local não os tem. */
  data?: string;
  status?: "paga" | "fiado" | "cancelada";
  empresa?: EmpresaComprovante | null;
  cliente?: ClienteComprovante | null;
  pagamento?: PagamentoComprovante | null;
  parcelas?: ParcelaResumoFiado[];
}

interface PartesEndereco {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** "Rua A, 12 — apto 3 · Centro · Salvador/BA · CEP 40000-000", sem buracos quando falta parte. */
export function enderecoEmLinha(p: PartesEndereco): string | null {
  const t = (v?: string | null) => (v ?? "").trim();
  const rua = [t(p.endereco), t(p.numero)].filter(Boolean).join(", ");
  const ruaComplemento = [rua, t(p.complemento)].filter(Boolean).join(" — ");
  const cidadeUf = [t(p.cidade), t(p.uf)].filter(Boolean).join("/");
  const cep = t(p.cep) ? `CEP ${t(p.cep)}` : "";
  const linha = [ruaComplemento, t(p.bairro), cidadeUf, cep].filter(Boolean).join(" · ");
  return linha || null;
}

/** 90 → "90 dias", 365 → "1 ano", 730 → "2 anos". */
export function garantiaTexto(dias: number): string {
  if (dias >= 365 && dias % 365 === 0) {
    const anos = dias / 365;
    return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  }
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** Itens que têm garantia — o bloco "Garantia" só existe quando esta lista não é vazia. */
export function itensComGarantia(itens: ItemComprovante[]): (ItemComprovante & { garantia_dias: number })[] {
  return itens.filter((i): i is ItemComprovante & { garantia_dias: number } => !!i.garantia_dias && i.garantia_dias > 0);
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
  if (d.pagamento && d.pagamento.taxaMaquinetaValor > 0) {
    linhas.push(`Taxa de maquineta: ${formatBRL(d.pagamento.taxaMaquinetaValor)}`);
  }

  const comGarantia = itensComGarantia(d.itens);
  if (comGarantia.length > 0) {
    linhas.push("", "Garantia:");
    for (const i of comGarantia) linhas.push(`- ${i.nome}: ${garantiaTexto(i.garantia_dias)}`);
  }

  if (d.parcelas && d.parcelas.length > 0) {
    linhas.push("", "Parcelas:");
    for (const p of d.parcelas) {
      const situacao = p.status === "paga" ? "paga" : p.status === "atrasada" ? "atrasada" : "em aberto";
      linhas.push(`${p.numero}/${p.totalParcelas} — ${formatBRL(p.valor)} — vence ${formatarDataIso(p.dataVencimento)} (${situacao})`);
    }
  }

  if (d.clienteNome) linhas.push("", `Cliente: ${d.clienteNome}`);
  return linhas.join("\n");
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
