/**
 * "Pedido rápido" da vitrine: os dados de quem já comprou ficam NO APARELHO dele
 * (localStorage), não no servidor. Buscar o cliente pelo WhatsApp numa rota pública deixaria
 * qualquer um descobrir quem compra na loja e onde mora (a 0043 evita isso de propósito).
 * PURO, coberto por `dados-comprador.test.ts`; quem lê e grava no navegador é o chamador.
 */

export interface DadosComprador {
  nome: string;
  whatsapp: string;
  email: string;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export const CHAVE_DADOS_COMPRADOR = "painel:vitrine:comprador";

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opcional = (v: unknown, max: number): string | null => texto(v, max) || null;

/** Lê o que foi guardado, descartando lixo. null quando não há nome e WhatsApp válidos. */
export function lerDadosComprador(bruto: string | null): DadosComprador | null {
  if (!bruto) return null;
  let o: unknown;
  try {
    o = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const nome = texto(r.nome, 120);
  const whatsapp = texto(r.whatsapp, 30);
  if (!nome || whatsapp.replace(/\D/g, "").length < 10) return null;
  return {
    nome,
    whatsapp,
    email: texto(r.email, 200),
    cep: opcional(r.cep, 10),
    endereco: opcional(r.endereco, 200),
    numero: opcional(r.numero, 20),
    bairro: opcional(r.bairro, 100),
    cidade: opcional(r.cidade, 100),
    uf: opcional(r.uf, 2),
  };
}

export function serializarDadosComprador(d: DadosComprador): string {
  return JSON.stringify(d);
}
