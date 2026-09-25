import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Ponto de entrada de todo link que o Supabase manda por e-mail: confirmação de cadastro,
 * recuperação de senha, convite, troca de e-mail.
 *
 * A versão anterior tratava UM caso (`?code=`) e mandava todo o resto para `/login` sem
 * mensagem nenhuma — link expirado, link já usado e link aberto em outro dispositivo eram
 * indistinguíveis de "fui deslogado". O usuário concluía que o sistema estava quebrado.
 *
 * Dois formatos são aceitos, de propósito:
 *
 * - `token_hash` + `type` → `verifyOtp`. É o formato que **funciona em qualquer
 *   dispositivo**, e por isso é o preferido: ele não depende do `code_verifier` do PKCE,
 *   que fica guardado só no navegador onde o fluxo começou. Quem se cadastra no computador
 *   e abre o e-mail no celular — o comportamento mais comum que existe — só consegue
 *   entrar por aqui. Exige os templates de e-mail com `{{ .TokenHash }}`.
 * - `code` → `exchangeCodeForSession`. Formato padrão dos templates do Supabase; mantido
 *   para o fluxo continuar funcionando antes de os templates serem trocados.
 */

const TIPOS_OTP: EmailOtpType[] = ["signup", "recovery", "invite", "magiclink", "email_change", "email"];

function ehTipoOtp(valor: string | null): valor is EmailOtpType {
  return valor !== null && (TIPOS_OTP as string[]).includes(valor);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // `nextUrl.clone()` em vez de `new URL(request.url)`: atrás do proxy da Vercel o `origin`
  // de `request.url` pode ser o host interno, e o redirect sairia para o domínio errado.
  function irPara(pathname: string, erro?: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = erro ? `?erro=${erro}` : "";
    return NextResponse.redirect(url);
  }

  // O Supabase devolve o erro na própria URL quando o link já venceu ou já foi usado.
  const erroUrl = searchParams.get("error");
  const erroCodigo = searchParams.get("error_code");
  if (erroUrl) {
    console.error("[auth/callback]", erroUrl, erroCodigo, searchParams.get("error_description"));
    return irPara("/login", erroCodigo === "otp_expired" ? "link_expirado" : "link_invalido");
  }

  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type");
  const code = searchParams.get("code");
  const supabase = await createClient();

  if (tokenHash && ehTipoOtp(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (error) {
      console.error("[auth/callback] verifyOtp", error.code, error.message);
      return irPara("/login", "link_expirado");
    }
    // Recuperação NUNCA cai no painel: quem clicou veio trocar a senha, e o destino é a
    // tela que faz isso. Mandar para /dashboard deixaria a pessoa logada sem nunca definir
    // a senha nova — foi o que a versão anterior fazia com `?code=` de recovery.
    return irPara(tipo === "recovery" ? "/auth/reset" : "/dashboard");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession", error.code, error.message);
      // Causa mais comum aqui: link aberto num navegador diferente do que iniciou o fluxo,
      // onde o `code_verifier` do PKCE não existe.
      return irPara("/login", "link_invalido");
    }
    return irPara(tipo === "recovery" ? "/auth/reset" : "/dashboard");
  }

  return irPara("/login", "link_invalido");
}
