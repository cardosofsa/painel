/**
 * XML da NF-e de compra (nota do fornecedor) → pedido de compra. PURO, coberto por
 * `compras-nfe.test.ts`. Lê as tags por expressão regular (o XML da NF-e tem leiaute fixo
 * da SEFAZ), sem DOMParser: assim roda igual no navegador e no teste.
 *
 * Custo de cada item = valor do produto + a parte dele de IPI, ICMS-ST e outras despesas,
 * menos a parte do desconto (rateio pelo valor do item). O frete fica separado, como no
 * pedido de compra. Assim o total do pedido bate com o total da nota.
 */

export interface ItemNfe {
  codigo: string;
  /** GTIN/EAN; null quando a nota diz "SEM GTIN". */
  ean: string | null;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  /** Custo por unidade já com impostos/despesas rateados (o que vai para o pedido). */
  custoUnitario: number;
}

export interface NfeCompra {
  chave: string | null;
  numero: string;
  serie: string | null;
  emissao: string | null;
  emitente: { cnpj: string | null; nome: string };
  itens: ItemNfe[];
  frete: number;
  total: number;
  duplicatas: { numero: string; vencimento: string; valor: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function decodificar(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Conteúdo da primeira tag `nome` (aceita prefixo de namespace, ex.: `nfe:NFe`). */
function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1] : null;
}

function todas(xml: string, nome: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, "g"))].map((m) => m[1]);
}

const texto = (xml: string | null, nome: string) => {
  const v = xml ? tag(xml, nome) : null;
  return v == null ? null : decodificar(v);
};
const numero = (xml: string | null, nome: string) => {
  const v = texto(xml, nome);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lança com mensagem em pt-BR quando o arquivo não é uma NF-e. */
export function interpretarNfeXml(xml: string): NfeCompra {
  const inf = tag(xml, "infNFe");
  if (!inf) throw new Error("Este arquivo não parece ser o XML de uma NF-e (não achei <infNFe>).");
  const id = xml.match(/<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/);
  const ide = tag(inf, "ide");
  const emit = tag(inf, "emit");
  const tot = tag(inf, "ICMSTot");

  const brutos = todas(inf, "det").map((det) => {
    const prod = tag(det, "prod") ?? "";
    const ean = texto(prod, "cEAN");
    return {
      codigo: texto(prod, "cProd") ?? "",
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null,
      descricao: texto(prod, "xProd") ?? "Item",
      ncm: texto(prod, "NCM"),
      unidade: texto(prod, "uCom"),
      quantidade: numero(prod, "qCom"),
      valorUnitario: numero(prod, "vUnCom"),
      valorTotal: numero(prod, "vProd"),
    };
  });
  if (brutos.length === 0) throw new Error("A nota não tem itens.");

  const frete = r2(numero(tot, "vFrete"));
  const acrescimos = numero(tot, "vIPI") + numero(tot, "vST") + numero(tot, "vOutro") - numero(tot, "vDesc");
  const somaProdutos = brutos.reduce((s, i) => s + i.valorTotal, 0);
  const itens: ItemNfe[] = brutos.map((i) => {
    const parte = somaProdutos > 0 ? (acrescimos * i.valorTotal) / somaProdutos : 0;
    const custo = i.quantidade > 0 ? (i.valorTotal + parte) / i.quantidade : i.valorUnitario;
    return { ...i, custoUnitario: r2(Math.max(0, custo)) };
  });

  const total = r2(numero(tot, "vNF") || somaProdutos + acrescimos + frete);
  const duplicatas = todas(inf, "dup")
    .map((d) => ({ numero: texto(d, "nDup") ?? "", vencimento: (texto(d, "dVenc") ?? "").slice(0, 10), valor: r2(numero(d, "vDup")) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) && d.valor > 0);

  return {
    chave: id ? id[1] : null,
    numero: texto(ide, "nNF") ?? "",
    serie: texto(ide, "serie"),
    emissao: (texto(ide, "dhEmi") ?? texto(ide, "dEmi"))?.slice(0, 10) ?? null,
    emitente: { cnpj: (texto(emit, "CNPJ") ?? texto(emit, "CPF"))?.replace(/\D/g, "") || null, nome: texto(emit, "xFant") || texto(emit, "xNome") || "Fornecedor" },
    itens,
    frete,
    total,
    duplicatas,
  };
}

/**
 * Parcelas da nota ajustadas ao total do pedido (o arredondamento do custo por unidade pode
 * deixar alguns centavos de diferença; vão para a última). Diferença grande = null (a nota
 * tem algo que o pedido não reproduz) e a tela usa o parcelamento normal.
 */
export function ajustarDuplicatas(duplicatas: NfeCompra["duplicatas"], totalPedido: number): { valor: number; vencimento: string }[] | null {
  if (duplicatas.length === 0) return null;
  const soma = duplicatas.reduce((s, d) => s + d.valor, 0);
  const dif = r2(totalPedido - soma);
  if (Math.abs(dif) > 1) return null;
  return duplicatas.map((d, i) => ({ vencimento: d.vencimento, valor: i === duplicatas.length - 1 ? r2(d.valor + dif) : d.valor }));
}

/** CNPJ só com dígitos, para comparar o da nota com o do cadastro (que pode ter máscara). */
export const digitosCnpj = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
