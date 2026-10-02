/**
 * Quem está OPERANDO (11.8): cookie assinado (HMAC-SHA256, Web Crypto) com o operador, as
 * telas dele e a validade. Não dá para forjar nem levar para outra conta (a assinatura
 * cobre tudo e o middleware confere o user_id do JWT). Puro + testado em `operador.test.ts`.
 */

import { abaDaRota, ABAS } from "./acesso";

export const COOKIE_OPERADOR = "sertao_operador";
/** Um turno: 12 horas. */
export const VALIDADE_OPERADOR_MS = 12 * 60 * 60 * 1000;

export interface OperadorSessao {
  /** user_id da conta da loja. */
  u: string;
  /** operador. */
  o: string;
  /** nome. */
  n: string;
  /** telas liberadas (ids de aba). */
  a: string[];
  /** expira (ms). */
  x: number;
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function chave(segredo: string): Promise<CryptoKey> {
  const base = await crypto.subtle.digest("SHA-256", enc.encode(`sertao-operador-v1:${segredo}`));
  return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function assinarOperador(d: Omit<OperadorSessao, "x">, segredo: string, agora = Date.now()): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify({ ...d, x: agora + VALIDADE_OPERADOR_MS })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chave(segredo), enc.encode(corpo)));
  return `${corpo}.${b64url(sig)}`;
}

/** null = ausente, adulterado, de outra conta ou vencido. */
export async function lerOperador(valor: string | undefined, segredo: string, userId: string, agora = Date.now()): Promise<OperadorSessao | null> {
  if (!valor) return null;
  const [corpo, sig] = valor.split(".");
  if (!corpo || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await chave(segredo), deB64url(sig) as BufferSource, enc.encode(corpo)))) return null;
    const d = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as OperadorSessao;
    if (d.u !== userId || typeof d.x !== "number" || d.x < agora || !Array.isArray(d.a)) return null;
    return d;
  } catch {
    return null;
  }
}

/** O operador pode abrir esta rota? Rotas fora das abas (ex.: /operador) sempre. */
export function operadorPodeRota(abas: string[], pathname: string): boolean {
  const aba = abaDaRota(pathname);
  return !aba || abas.includes(aba);
}

/** Primeira tela do operador (para onde ir depois de entrar ou ao ser barrado). */
export function telaInicialOperador(abas: string[]): string {
  const ordem = ["pdv", "vendas", "dashboard", ...ABAS.map((a) => a.id)];
  const id = ordem.find((a) => abas.includes(a));
  return ABAS.find((a) => a.id === id)?.href ?? "/operador";
}

/** Papéis prontos para começar (as telas podem ser ajustadas depois). */
export const PAPEIS_OPERADOR: { id: string; rotulo: string; abas: string[] }[] = [
  { id: "caixa", rotulo: "Caixa (PDV)", abas: ["pdv"] },
  { id: "vendedor", rotulo: "Vendedor", abas: ["pdv", "vendas", "clientes", "catalogo"] },
  { id: "estoquista", rotulo: "Estoquista", abas: ["produtos", "estoque", "compras", "fornecedores"] },
  { id: "expedicao", rotulo: "Expedição", abas: ["vendas"] },
  { id: "gerente", rotulo: "Gerente", abas: ["dashboard", "pdv", "vendas", "precificacao", "produtos", "clientes", "fornecedores", "compras", "estoque", "financeiro", "catalogo", "vixe"] },
];
