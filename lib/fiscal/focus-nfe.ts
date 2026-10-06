/**
 * NF-e pela Focus NFe (Fase 11.7). A parte pura — montar a nota a partir da venda e dizer o
 * que falta — é coberta por `fiscal.test.ts`; as chamadas à API ficam no fim (SERVIDOR).
 *
 * Regras fiscais (CFOP, CSOSN, PIS/COFINS) vêm da configuração da conta: os padrões servem
 * ao Simples Nacional comum, mas QUEM DECIDE é o contador. O certificado A1 é cadastrado no
 * próprio painel do emissor; o Sertão só guarda o token da API (cifrado).
 */

export type Ambiente = "homologacao" | "producao";

export const HOST_FOCUS: Record<Ambiente, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export interface ConfigFiscal {
  ambiente: Ambiente;
  serie: number;
  inscricao_estadual: string | null;
  crt: 1 | 2 | 3;
  cfop_padrao: string;
  cfop_fora_estado: string;
  csosn_padrao: string;
  pis_cofins_cst: string;
  natureza: string;
}

export interface EmpresaFiscal {
  cnpj: string | null;
  nome: string | null;
  uf: string | null;
}

export interface DestinatarioFiscal {
  nome: string | null;
  documento: string | null;
  email?: string | null;
  telefone?: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface ItemFiscal {
  codigo: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  ncm: string | null;
  origem: number;
  cfop: string | null;
}

export interface VendaFiscal {
  numero: string;
  data: string;
  desconto: number;
  frete: number;
  /** true = venda presencial (balcão). */
  presencial: boolean;
  itens: ItemFiscal[];
}

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** O que impede emitir (mostrado antes de chamar o emissor). Vazio = pode emitir. */
export function pendenciasFiscais(v: VendaFiscal, e: EmpresaFiscal, d: DestinatarioFiscal | null): string[] {
  const p: string[] = [];
  if (so(e.cnpj).length !== 14) p.push("CNPJ da empresa (Configurações → Conta).");
  if (!e.uf) p.push("UF da empresa (Configurações → Conta).");
  for (const i of v.itens) if (!/^\d{8}$/.test(i.ncm ?? "")) p.push(`NCM do produto "${i.descricao}" (Produtos → editar).`);
  if (!d?.nome) p.push("Nome do cliente.");
  const doc = so(d?.documento);
  if (doc.length !== 11 && doc.length !== 14) p.push("CPF ou CNPJ do cliente (cadastro do cliente).");
  if (!v.presencial && (!d?.cep || !d.endereco || !d.cidade || !d.uf)) p.push("Endereço completo do cliente (entrega).");
  return [...new Set(p)];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Corpo do POST /v2/nfe (Focus NFe), com desconto e frete rateados nos itens. */
export function montarNfe(v: VendaFiscal, c: ConfigFiscal, e: EmpresaFiscal, d: DestinatarioFiscal) {
  const doc = so(d.documento);
  const foraDoEstado = !!(d.uf && e.uf && d.uf.toUpperCase() !== e.uf.toUpperCase());
  const brutoTotal = v.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  let descRestante = r2(v.desconto);
  let freteRestante = r2(v.frete);
  const itens = v.itens.map((i, n) => {
    const bruto = r2(i.quantidade * i.valorUnitario);
    const ultimo = n === v.itens.length - 1;
    const desconto = ultimo ? descRestante : r2(brutoTotal > 0 ? (v.desconto * bruto) / brutoTotal : 0);
    const frete = ultimo ? freteRestante : r2(brutoTotal > 0 ? (v.frete * bruto) / brutoTotal : 0);
    descRestante = r2(descRestante - desconto);
    freteRestante = r2(freteRestante - frete);
    return {
      numero_item: n + 1,
      codigo_produto: i.codigo.slice(0, 60),
      descricao: i.descricao.slice(0, 120),
      cfop: i.cfop ?? (foraDoEstado ? c.cfop_fora_estado : c.cfop_padrao),
      unidade_comercial: "UN",
      quantidade_comercial: i.quantidade,
      valor_unitario_comercial: r2(i.valorUnitario),
      valor_bruto: bruto,
      unidade_tributavel: "UN",
      quantidade_tributavel: i.quantidade,
      valor_unitario_tributavel: r2(i.valorUnitario),
      codigo_ncm: i.ncm,
      icms_origem: i.origem,
      icms_situacao_tributaria: c.csosn_padrao,
      pis_situacao_tributaria: c.pis_cofins_cst,
      cofins_situacao_tributaria: c.pis_cofins_cst,
      ...(desconto > 0 ? { valor_desconto: desconto } : {}),
      ...(frete > 0 ? { valor_frete: frete } : {}),
    };
  });
  return {
    natureza_operacao: c.natureza,
    data_emissao: v.data,
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: foraDoEstado ? 2 : 1,
    consumidor_final: 1,
    presenca_comprador: v.presencial ? 1 : 2,
    cnpj_emitente: so(e.cnpj),
    ...(c.inscricao_estadual ? { inscricao_estadual_emitente: so(c.inscricao_estadual) } : {}),
    regime_tributario_emitente: c.crt,
    nome_destinatario: (d.nome ?? "").slice(0, 60),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: 9,
    ...(d.email ? { email_destinatario: d.email } : {}),
    ...(d.endereco ? { logradouro_destinatario: d.endereco, numero_destinatario: d.numero || "S/N", bairro_destinatario: d.bairro ?? "", municipio_destinatario: d.cidade ?? "", uf_destinatario: (d.uf ?? "").toUpperCase(), cep_destinatario: so(d.cep) } : {}),
    modalidade_frete: v.frete > 0 ? 0 : 9,
    items: itens,
  };
}

export type StatusNota = "processando" | "autorizada" | "rejeitada" | "cancelada";

/** Resposta da Focus → status do Sertão. */
export function statusDaFocus(j: { status?: string; mensagem_sefaz?: string; mensagem?: string } | null): { status: StatusNota; mensagem: string | null } {
  const s = j?.status ?? "";
  if (s === "autorizado") return { status: "autorizada", mensagem: j?.mensagem_sefaz ?? null };
  if (s === "cancelado") return { status: "cancelada", mensagem: j?.mensagem_sefaz ?? null };
  if (s === "erro_autorizacao" || s === "denegado") return { status: "rejeitada", mensagem: j?.mensagem_sefaz ?? j?.mensagem ?? "Rejeitada pela Sefaz." };
  return { status: "processando", mensagem: null };
}

// ---------- API ----------

function cabecalho(token: string) {
  return { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`, "Content-Type": "application/json" };
}

export async function emitirNfeFocus(token: string, ambiente: Ambiente, ref: string, corpo: unknown) {
  const r = await fetch(`${HOST_FOCUS[ambiente]}/v2/nfe?ref=${encodeURIComponent(ref)}`, { method: "POST", headers: cabecalho(token), body: JSON.stringify(corpo), cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status === 401) throw new Error("Token do emissor inválido (Configurações → Fiscal).");
  if (!r.ok && r.status !== 422) throw new Error(String(j?.mensagem ?? `Emissor respondeu ${r.status}.`));
  return j;
}

export async function consultarNfeFocus(token: string, ambiente: Ambiente, ref: string) {
  const r = await fetch(`${HOST_FOCUS[ambiente]}/v2/nfe/${encodeURIComponent(ref)}`, { headers: cabecalho(token), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  return (await r.json().catch(() => null)) as Record<string, unknown> | null;
}

/** Os caminhos da Focus são relativos ao host. */
export function urlFocus(ambiente: Ambiente, caminho: unknown): string | null {
  return typeof caminho === "string" && caminho ? (caminho.startsWith("http") ? caminho : `${HOST_FOCUS[ambiente]}${caminho}`) : null;
}
