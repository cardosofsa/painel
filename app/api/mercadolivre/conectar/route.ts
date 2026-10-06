import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { credenciaisML, urlAutorizacaoML } from "@/lib/marketplace/mercadolivre-api";
import { cofreDisponivel } from "@/lib/ia/cofre";
import { dominioPrincipalSeDiferente, origemDaRequisicao } from "@/lib/origem";

/**
 * Começa a autorização de uma loja no Mercado Livre (10.8). Mesmo desenho da Shopee:
 * `estado` aleatório em cookie (CSRF) e a loja também em cookie — o ML exige o
 * redirect_uri EXATO cadastrado no app, então nada pode ir na query de volta.
 */
export async function GET(req: NextRequest) {
  // O ML exige o redirect_uri exato do app: começa pelo domínio principal.
  const origem = origemDaRequisicao(req.headers, req.nextUrl.origin);
  const principal = dominioPrincipalSeDiferente(origem);
  if (principal) return NextResponse.redirect(`${principal}${req.nextUrl.pathname}${req.nextUrl.search}`);
  const loja = req.nextUrl.searchParams.get("loja") ?? "";
  const c = credenciaisML();
  const volta = req.nextUrl.searchParams.get("volta") === "configuracoes" ? "/configuracoes" : "/vendas";
  if (!c || !cofreDisponivel()) return NextResponse.redirect(new URL(`${volta}?shopee=ml_desligada`, origem));
  if (!/^[0-9a-f-]{36}$/i.test(loja)) return NextResponse.redirect(new URL(`${volta}?shopee=ml_erro`, origem));

  const supabase = await createClient();
  const { data } = await supabase.from("lojas_canal").select("id").eq("id", loja).maybeSingle();
  if (!data) return NextResponse.redirect(new URL(`${volta}?shopee=ml_erro`, origem));

  const estado = randomBytes(16).toString("hex");
  const retorno = new URL("/api/mercadolivre/callback", origem).toString();
  const res = NextResponse.redirect(urlAutorizacaoML(c, retorno, estado));
  const opcoes = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/api/mercadolivre" };
  res.cookies.set("ml_estado", estado, opcoes);
  res.cookies.set("ml_loja", loja, opcoes);
  res.cookies.set("ml_volta", volta, opcoes);
  return res;
}
