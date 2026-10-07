"use server";

import { createClient } from "@/lib/supabase/server";
import { comResultado, type Resultado } from "@/lib/acao";
import { traduzirErroAuth, type ErroAuth } from "@/lib/erros";
import { validar, codigoMfaSchema, confirmarMfaSchema } from "@/lib/validacao";
import { EMISSOR_MFA, NOME_FATOR_MFA, fatorTotpVerificado, fatoresTotpPendentes, qrComoDataUri, statusDosFatores, type FatorMfa, type StatusMfa } from "@/lib/mfa";

/**
 * Verificação em duas etapas (MFA TOTP) da própria conta, em Configurações.
 *
 * Tudo aqui é Supabase Auth — nenhuma tabela nossa. As travas que importam são da GoTrue:
 * desativar um fator verificado e trocar a senha de quem tem fator exigem sessão `aal2`, e o
 * `verify` confere o código. O que esta camada acrescenta é pedir o código também para
 * desativar (prova de que a pessoa ainda tem o celular, não só uma sessão aberta) e nunca
 * deixar "cancelar a ativação" apagar um fator já confirmado.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

function falhaAuth(erro: ErroAuth): never {
  throw new Error(traduzirErroAuth(erro));
}

/** Fatores da conta pela GoTrue (`getUser`, ida ao Auth): a fonte autêntica, não o cookie. */
async function fatoresDaConta(supabase: Supabase): Promise<FatorMfa[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) falhaAuth(error);
  return data.all;
}

export async function statusDuasEtapas(): Promise<Resultado<StatusMfa>> {
  return comResultado(async () => statusDosFatores(await fatoresDaConta(await createClient())));
}

export interface InicioDuasEtapas {
  fatorId: string;
  /** Data URI do QR (SVG), ou null se o formato vier diferente — o segredo continua servindo. */
  qr: string | null;
  /** Para digitar no app quando não dá para ler o QR (o celular é o próprio aparelho). */
  segredo: string;
  /** `otpauth://`: abre o app autenticador direto, no celular. */
  uri: string;
}

/**
 * Gera o QR e o segredo. O fator nasce `unverified` e só passa a valer depois do código
 * (`confirmarDuasEtapas`); até lá a conta entra como sempre.
 */
export async function iniciarDuasEtapas(): Promise<Resultado<InicioDuasEtapas>> {
  return comResultado(async () => {
    const supabase = await createClient();
    const fatores = await fatoresDaConta(supabase);
    if (fatorTotpVerificado(fatores)) throw new Error("A verificação em duas etapas já está ativa nesta conta.");

    // Tentativa anterior que ficou pela metade ocupa o nome do fator e faria o enroll falhar.
    for (const pendente of fatoresTotpPendentes(fatores)) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: pendente.id });
      if (error) falhaAuth(error);
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: EMISSOR_MFA, friendlyName: NOME_FATOR_MFA });
    if (error) falhaAuth(error);
    return { fatorId: data.id, qr: qrComoDataUri(data.totp.qr_code), segredo: data.totp.secret, uri: data.totp.uri };
  });
}

/**
 * Confirma o primeiro código. A GoTrue marca o fator como verificado, eleva ESTA sessão a
 * `aal2` (os cookies novos saem nesta resposta) e encerra as sessões `aal1` da conta em
 * outros aparelhos — que, para voltar, vão passar pelo código.
 */
export async function confirmarDuasEtapas(fatorId: string, codigo: string): Promise<Resultado<StatusMfa>> {
  return comResultado(async () => {
    const dados = validar(confirmarMfaSchema, { fatorId, codigo });
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: dados.fatorId, code: dados.codigo });
    if (error) falhaAuth(error);
    return statusDosFatores(await fatoresDaConta(supabase));
  });
}

/** Desiste no meio da ativação: apaga o fator ainda não confirmado. Nunca um verificado. */
export async function cancelarDuasEtapas(fatorId: string): Promise<Resultado> {
  return comResultado(async () => {
    const supabase = await createClient();
    const fator = (await fatoresDaConta(supabase)).find((f) => f.id === fatorId);
    if (!fator || fator.status === "verified") return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
    if (error) falhaAuth(error);
  });
}

/**
 * Desativa pedindo o código atual. Com sessão `aal2` a GoTrue já aceitaria o `unenroll`
 * sozinho; o código a mais é o que impede alguém que pegou o computador destravado de tirar
 * a proteção sem o celular.
 */
export async function desativarDuasEtapas(codigo: string): Promise<Resultado<StatusMfa>> {
  return comResultado(async () => {
    const dados = validar(codigoMfaSchema, { codigo });
    const supabase = await createClient();
    const fatores = await fatoresDaConta(supabase);
    const fator = fatorTotpVerificado(fatores);
    if (!fator) return statusDosFatores(fatores);

    const { error: erroCodigo } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: dados.codigo });
    if (erroCodigo) falhaAuth(erroCodigo);

    const { error } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
    if (error) falhaAuth(error);
    return { ativo: false, desde: null };
  });
}
