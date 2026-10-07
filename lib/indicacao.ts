/**
 * Programa de indicação (0078) e origem do cadastro (UTM). Só lógica pura: o /signup usa
 * para ler `?ref=` e `utm_*` da URL, e a aba Plano para montar o link pessoal.
 */

/** Mesmo alfabeto da migração: sem 0/O, 1/I/L. */
export const CODIGO_INDICACAO_RE = /^[A-HJKMNP-Z2-9]{7}$/;

export const CHAVE_ORIGEM = "sertao:origem-cadastro";

export const CAMPOS_ORIGEM = ["ref", "utm_source", "utm_medium", "utm_campaign"] as const;
export type CampoOrigem = (typeof CAMPOS_ORIGEM)[number];
export type OrigemCadastro = Partial<Record<CampoOrigem, string>>;

/** Normaliza o código digitado/colado: maiúsculo, sem espaço. `null` se não tem o formato. */
export function normalizarCodigo(bruto: string | null | undefined): string | null {
  const c = (bruto ?? "").trim().toUpperCase();
  return CODIGO_INDICACAO_RE.test(c) ? c : null;
}

/** UTM vira texto curto e sem caractere de controle (vai para os metadados do usuário). */
function limparUtm(bruto: string | null): string | null {
  const t = (bruto ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
  return t || null;
}

/** Lê `ref` e `utm_*` de uma query string. Campo inválido ou vazio fica de fora. */
export function origemDaUrl(busca: string | URLSearchParams): OrigemCadastro {
  const p = typeof busca === "string" ? new URLSearchParams(busca) : busca;
  const out: OrigemCadastro = {};
  const ref = normalizarCodigo(p.get("ref"));
  if (ref) out.ref = ref;
  for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const v = limparUtm(p.get(k));
    if (v) out[k] = v;
  }
  return out;
}

/** Lê o que foi guardado (JSON do sessionStorage), descartando o que não for válido. */
export function origemSalva(json: string | null): OrigemCadastro {
  if (!json) return {};
  try {
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== "object") return {};
    const p = new URLSearchParams();
    for (const k of CAMPOS_ORIGEM) {
      const v = (o as Record<string, unknown>)[k];
      if (typeof v === "string") p.set(k, v);
    }
    return origemDaUrl(p);
  } catch {
    return {};
  }
}

/** A URL atual manda; o que veio antes (salvo) completa o que faltar. */
export function mesclarOrigem(salva: OrigemCadastro, daUrl: OrigemCadastro): OrigemCadastro {
  return { ...salva, ...daUrl };
}

/** Link pessoal: `<base>/signup?ref=CODIGO` (sem barra dupla). */
export function linkIndicacao(base: string, codigo: string): string {
  return `${base.replace(/\/+$/, "")}/signup?ref=${encodeURIComponent(codigo)}`;
}

export function mensagemWhatsApp(link: string): string {
  return `Estou usando o Sertão para cuidar da minha loja (preço, estoque e vendas). Crie sua conta pelo meu link: ${link}`;
}

export function linkWhatsApp(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagemWhatsApp(link))}`;
}

/** Resposta da RPC `minhas_indicacoes()`. */
export interface ResumoIndicacoes {
  codigo: string;
  link: string;
  dias_bonus: number;
  cadastros: number;
  recompensadas: number;
}

/** Valida a resposta da RPC (jsonb). `null` se veio algo inesperado. */
export function lerResumoIndicacoes(bruto: unknown): ResumoIndicacoes | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const codigo = normalizarCodigo(typeof o.codigo === "string" ? o.codigo : null);
  if (!codigo) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { codigo, link: `/signup?ref=${codigo}`, dias_bonus: n(o.dias_bonus) || 30, cadastros: n(o.cadastros), recompensadas: n(o.recompensadas) };
}

/** Resposta da RPC `admin_origem_conta(uuid)` (só o master): de onde a conta veio. */
export interface OrigemConta {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ref: string | null;
  indicado_por: string | null;
  recompensado_em: string | null;
  codigo: string | null;
  indicou: number;
}

export function lerOrigemConta(bruto: unknown): OrigemConta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    utm_source: t(o.utm_source),
    utm_medium: t(o.utm_medium),
    utm_campaign: t(o.utm_campaign),
    ref: t(o.ref),
    indicado_por: t(o.indicado_por),
    recompensado_em: t(o.recompensado_em),
    codigo: t(o.codigo),
    indicou: Number.isFinite(Number(o.indicou)) ? Number(o.indicou) : 0,
  };
}
