/**
 * Verificação em duas etapas (MFA TOTP do Supabase Auth): o que dá para testar sem rede
 * (`mfa.test.ts`). Ativar e desativar passam pelas Server Actions de
 * `app/(painel)/configuracoes/mfa-actions.ts`; o código da entrada vai do navegador
 * (`verificarSegundoFator`, ver o porquê em `app/auth/mfa/MfaClient.tsx`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ErroAuth } from "./erros";

/** Nome que aparece no app autenticador, ao lado do e-mail da conta. */
export const EMISSOR_MFA = "Sertão";

/** O que o Supabase grava como `friendly_name` do fator (único por conta). */
export const NOME_FATOR_MFA = "Aplicativo autenticador";

export const DIGITOS_CODIGO = 6;

/**
 * Só os dígitos, no máximo 6. O app autenticador mostra o código como "123 456" e o celular
 * cola com espaço; recusar por isso seria implicância.
 */
export function limparCodigo(bruto: string): string {
  return bruto.replace(/\D/g, "").slice(0, DIGITOS_CODIGO);
}

export function codigoCompleto(codigo: string): boolean {
  return new RegExp(`^\\d{${DIGITOS_CODIGO}}$`).test(codigo);
}

/**
 * QR do `enroll` pronto para `<img src>`.
 *
 * O auth-js devolve `data:image/svg+xml;utf-8,<svg ...>` com o SVG cru colado depois da
 * vírgula. Funciona na maioria dos navegadores, mas não é uma data URI válida: `utf-8` não é
 * parâmetro (o certo é `charset=utf-8`) e um `#` no SVG (cor, por exemplo) seria lido como
 * início de fragmento, cortando a imagem. Recodificar com `encodeURIComponent` resolve os
 * dois. A CSP já libera `data:` em `img-src` (`lib/csp.ts`).
 */
export function qrComoDataUri(qr: string | null | undefined): string | null {
  if (!qr) return null;
  const texto = qr.trim();
  const prefixoSvg = /^data:image\/svg\+xml(?:;[^,]*)?,/i;
  if (prefixoSvg.test(texto)) {
    const cabecalho = texto.match(prefixoSvg)![0];
    const corpo = texto.slice(cabecalho.length);
    // Já veio em base64 ou já codificado: não mexe.
    if (/;base64,$/i.test(cabecalho) || !/[<>#"\s]/.test(corpo)) return texto;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(corpo)}`;
  }
  if (texto.startsWith("<svg") || texto.startsWith("<?xml")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`;
  }
  if (/^data:image\/(png|gif|jpeg|webp);base64,/i.test(texto)) return texto;
  return null;
}

/** Segredo em blocos de 4 ("JBSW Y3DP ..."), para digitar no app sem se perder. */
export function segredoEmGrupos(segredo: string): string {
  return segredo
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1 ");
}

/** O pedaço de `Factor` (auth-js) que a tela usa. */
export interface FatorMfa {
  id: string;
  factor_type: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

/** O fator TOTP já confirmado da conta, se houver. */
export function fatorTotpVerificado(fatores: readonly FatorMfa[] | null | undefined): FatorMfa | null {
  return (fatores ?? []).find((f) => f.factor_type === "totp" && f.status === "verified") ?? null;
}

/**
 * TOTP que ficou pela metade (a pessoa gerou o QR e não digitou o código). Sobra no Supabase
 * até expirar e, enquanto isso, ocupa o `friendly_name` — um novo `enroll` com o mesmo nome
 * falharia. Por isso o "Ativar" apaga estes antes.
 */
export function fatoresTotpPendentes(fatores: readonly FatorMfa[] | null | undefined): FatorMfa[] {
  return (fatores ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified");
}

/** O que a tela de Configurações recebe sobre o MFA da conta. */
export interface StatusMfa {
  ativo: boolean;
  /** Quando o fator foi confirmado (`updated_at` do fator, ISO). */
  desde: string | null;
}

export function statusDosFatores(fatores: readonly FatorMfa[] | null | undefined): StatusMfa {
  const fator = fatorTotpVerificado(fatores);
  return { ativo: !!fator, desde: fator ? (fator.updated_at ?? fator.created_at ?? null) : null };
}

/**
 * Leva a sessão a `aal2` com o código do app: acha o TOTP verificado da conta e faz
 * `challengeAndVerify`. Usado no navegador (tela `/auth/mfa` e troca de senha), onde o limite
 * de tentativas do Supabase vale para o IP de quem digita.
 *
 * `semFator`: a conta não tem fator verificado (desativado em outro aparelho ou removido pelo
 * administrador) — não há o que conferir, e quem chamou segue.
 */
export async function verificarSegundoFator(
  supabase: Pick<SupabaseClient, "auth">,
  codigo: string,
): Promise<{ erro: ErroAuth | null; semFator: boolean }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { erro: error, semFator: false };
  const fator = fatorTotpVerificado(data.all);
  if (!fator) return { erro: null, semFator: true };
  const { error: erroVerificacao } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
  return { erro: erroVerificacao, semFator: false };
}
