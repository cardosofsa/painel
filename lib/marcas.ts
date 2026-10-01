/**
 * Marcas de marketplaces, redes sociais e meios de pagamento, reconhecidas pelo NOME (do
 * canal, da loja, da origem). PURO, coberto por `marcas.test.ts`.
 *
 * O desenho vem do `simple-icons` quando ele tem a marca; quando não tem (Mercado Livre,
 * Amazon, Shein, Magalu e outras saíram ou nunca entraram por questão de marca registrada),
 * o ícone mostra um selo com a cor e a sigla da marca (`components/ui/IconeMarca.tsx`).
 */

export type IdMarca =
  | "shopee"
  | "mercadolivre"
  | "amazon"
  | "shein"
  | "magalu"
  | "tiktok"
  | "aliexpress"
  | "temu"
  | "americanas"
  | "olx"
  | "nuvemshop"
  | "shopify"
  | "ebay"
  | "instagram"
  | "whatsapp"
  | "facebook"
  | "youtube"
  | "pinterest"
  | "telegram"
  | "x"
  | "pix"
  | "mercadopago";

export interface Marca {
  id: IdMarca;
  nome: string;
  /** Cor oficial (hex sem #). */
  cor: string;
  /** Sigla do selo quando não há desenho. */
  sigla: string;
  /** Cor do texto do selo. */
  corTexto: string;
}

export const MARCAS: Record<IdMarca, Marca> = {
  shopee: { id: "shopee", nome: "Shopee", cor: "EE4D2D", sigla: "S", corTexto: "FFFFFF" },
  mercadolivre: { id: "mercadolivre", nome: "Mercado Livre", cor: "FFE600", sigla: "ML", corTexto: "2D3277" },
  amazon: { id: "amazon", nome: "Amazon", cor: "FF9900", sigla: "a", corTexto: "131921" },
  shein: { id: "shein", nome: "Shein", cor: "000000", sigla: "S", corTexto: "FFFFFF" },
  magalu: { id: "magalu", nome: "Magalu", cor: "0086FF", sigla: "M", corTexto: "FFFFFF" },
  tiktok: { id: "tiktok", nome: "TikTok", cor: "000000", sigla: "T", corTexto: "FFFFFF" },
  aliexpress: { id: "aliexpress", nome: "AliExpress", cor: "FF4747", sigla: "A", corTexto: "FFFFFF" },
  temu: { id: "temu", nome: "Temu", cor: "FB7701", sigla: "T", corTexto: "FFFFFF" },
  americanas: { id: "americanas", nome: "Americanas", cor: "E60014", sigla: "a", corTexto: "FFFFFF" },
  olx: { id: "olx", nome: "OLX", cor: "6E0AD6", sigla: "OLX", corTexto: "FFFFFF" },
  nuvemshop: { id: "nuvemshop", nome: "Nuvemshop", cor: "2C3357", sigla: "N", corTexto: "FFFFFF" },
  shopify: { id: "shopify", nome: "Shopify", cor: "7AB55C", sigla: "S", corTexto: "FFFFFF" },
  ebay: { id: "ebay", nome: "eBay", cor: "E53238", sigla: "e", corTexto: "FFFFFF" },
  instagram: { id: "instagram", nome: "Instagram", cor: "FF0069", sigla: "IG", corTexto: "FFFFFF" },
  whatsapp: { id: "whatsapp", nome: "WhatsApp", cor: "25D366", sigla: "W", corTexto: "FFFFFF" },
  facebook: { id: "facebook", nome: "Facebook", cor: "0866FF", sigla: "f", corTexto: "FFFFFF" },
  youtube: { id: "youtube", nome: "YouTube", cor: "FF0000", sigla: "▶", corTexto: "FFFFFF" },
  pinterest: { id: "pinterest", nome: "Pinterest", cor: "BD081C", sigla: "P", corTexto: "FFFFFF" },
  telegram: { id: "telegram", nome: "Telegram", cor: "26A5E4", sigla: "T", corTexto: "FFFFFF" },
  x: { id: "x", nome: "X", cor: "000000", sigla: "X", corTexto: "FFFFFF" },
  pix: { id: "pix", nome: "Pix", cor: "32BCAD", sigla: "Pix", corTexto: "FFFFFF" },
  mercadopago: { id: "mercadopago", nome: "Mercado Pago", cor: "00B1EA", sigla: "MP", corTexto: "FFFFFF" },
};

/** Ordem importa: "Mercado Pago" antes de "Mercado Livre"; "TikTok Shop" cai em tiktok. */
const PADROES: [RegExp, IdMarca][] = [
  [/shopee/, "shopee"],
  [/mercado\s*pago/, "mercadopago"],
  [/mercado\s*livre|mercadolivre|mercado\s*libre|\bmeli\b/, "mercadolivre"],
  [/amazon/, "amazon"],
  [/shein/, "shein"],
  [/magalu|magazine\s*luiza/, "magalu"],
  [/tik\s*tok/, "tiktok"],
  [/ali\s*express/, "aliexpress"],
  [/\btemu\b/, "temu"],
  [/americanas/, "americanas"],
  [/\bolx\b/, "olx"],
  [/nuvem\s*shop/, "nuvemshop"],
  [/shopify/, "shopify"],
  [/\bebay\b/, "ebay"],
  [/instagram|\binsta\b/, "instagram"],
  [/whats\s*app|\bzap\b/, "whatsapp"],
  [/facebook|\bfb\b/, "facebook"],
  [/youtube/, "youtube"],
  [/pinterest/, "pinterest"],
  [/telegram/, "telegram"],
  [/\bpix\b/, "pix"],
];

/** "Shopee — Loja 1", "MERCADO LIVRE", "Magazine Luiza" → id da marca; null se não reconhecer. */
export function marcaDoNome(nome: string | null | undefined): IdMarca | null {
  const s = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!s.trim()) return null;
  for (const [re, id] of PADROES) if (re.test(s)) return id;
  return null;
}
