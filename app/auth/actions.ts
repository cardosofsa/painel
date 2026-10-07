"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroAuth } from "@/lib/erros";
import { validar, recuperacaoSchema, novaSenhaSchema, captchaTokenSchema } from "@/lib/validacao";
import { opcoesCaptcha } from "@/lib/captcha";

/**
 * Monta a URL absoluta de destino dos links de e-mail. Em produção vem de
 * `NEXT_PUBLIC_SITE_URL`; na falta dela, do header da requisição — assim funciona em
 * localhost e em preview sem configuração extra.
 */
async function origemDoApp(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export interface ResultadoAuth {
  ok: boolean;
  mensagem: string;
}

/**
 * Pede o e-mail de redefinição de senha.
 *
 * **A resposta é deliberadamente idêntica exista ou não a conta.** Diferenciar os dois casos
 * transformaria esta tela num verificador de quem tem cadastro no sistema — qualquer pessoa
 * poderia testar uma lista de e-mails e descobrir quais são clientes. Por isso não há
 * consulta ao banco antes da chamada e o `if (error)` não vaza o motivo.
 *
 * A única exceção é o limite de envio: ele não revela nada sobre a existência da conta, e
 * sem essa mensagem o usuário clica três vezes e não entende por que nenhum e-mail chega.
 * O captcha recusado também volta (não diz nada sobre a conta e, calado, viraria um "enviado"
 * que nunca chega).
 *
 * `captchaToken`: do widget do Turnstile, só quando `NEXT_PUBLIC_TURNSTILE_SITE_KEY` existe.
 */
export async function solicitarRecuperacaoSenha(email: string, captchaToken?: string): Promise<ResultadoAuth> {
  const dados = validar(recuperacaoSchema, { email });
  const token = validar(captchaTokenSchema, captchaToken);
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(dados.email, {
    redirectTo: `${await origemDoApp()}/auth/callback?type=recovery`,
    ...opcoesCaptcha(token),
  });

  if (error?.code === "over_email_send_rate_limit" || error?.status === 429 || error?.code === "captcha_failed") {
    return { ok: false, mensagem: traduzirErroAuth(error) };
  }
  if (error) {
    // Registrado no servidor, invisível para quem pediu — é o que preserva o anonimato.
    console.error("[auth] resetPasswordForEmail", error.code, error.message);
  }

  return {
    ok: true,
    mensagem: "Se existir uma conta com esse e-mail, o link de redefinição já está a caminho. Confira também o spam.",
  };
}

/** Reenvia a confirmação de cadastro para quem perdeu o primeiro e-mail. */
export async function reenviarConfirmacao(email: string, captchaToken?: string): Promise<ResultadoAuth> {
  const dados = validar(recuperacaoSchema, { email });
  const token = validar(captchaTokenSchema, captchaToken);
  const supabase = await createClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: dados.email,
    options: { emailRedirectTo: `${await origemDoApp()}/auth/callback?type=signup`, ...opcoesCaptcha(token) },
  });

  if (error?.code === "over_email_send_rate_limit" || error?.status === 429 || error?.code === "captcha_failed") {
    return { ok: false, mensagem: traduzirErroAuth(error) };
  }
  if (error) console.error("[auth] resend", error.code, error.message);

  return { ok: true, mensagem: "Se a conta existir e ainda não estiver confirmada, o link foi reenviado." };
}

/**
 * Grava a nova senha usando a sessão que o link de recuperação criou.
 *
 * O `signOut({ scope: "others" })` no fim não é detalhe: sem ele, "troquei a senha porque
 * alguém entrou na minha conta" deixa o invasor logado no aparelho dele indefinidamente,
 * porque trocar a senha não revoga os refresh tokens já emitidos.
 */
export async function redefinirSenha(senha: string, confirmacao: string): Promise<ResultadoAuth> {
  const dados = validar(novaSenhaSchema, { senha, confirmacao });
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, mensagem: "Este link expirou. Peça um novo link de redefinição." };
  }

  const { error } = await supabase.auth.updateUser({ password: dados.senha });
  if (error) return { ok: false, mensagem: traduzirErroAuth(error) };

  const { error: erroSaida } = await supabase.auth.signOut({ scope: "others" });
  if (erroSaida) console.error("[auth] signOut others", erroSaida.code, erroSaida.message);

  return { ok: true, mensagem: "Senha redefinida. Entre com a nova senha." };
}
