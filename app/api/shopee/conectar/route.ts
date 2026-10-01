import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { credenciaisShopee, urlAutorizacao } from "@/lib/marketplace/shopee-api";
import { cofreDisponivel } from "@/lib/ia/cofre";

/**
 * Começa a autorização de uma loja na Shopee. Guarda um `estado` aleatório em cookie e o
 * manda no redirect: o callback só aceita a volta que trouxer o mesmo valor (CSRF).
 */
export async function GET(req: NextRequest) {
  const loja = req.nextUrl.searchParams.get("loja") ?? "";
  const c = credenciaisShopee();
  // Para onde voltar depois da autorização (só os dois destinos conhecidos).
  const volta = req.nextUrl.searchParams.get("volta") === "configuracoes" ? "/configuracoes" : "/vendas";
  if (!c || !cofreDisponivel()) return NextResponse.redirect(new URL(`${volta}?shopee=desligada`, req.url));
  if (!/^[0-9a-f-]{36}$/i.test(loja)) return NextResponse.redirect(new URL(`${volta}?shopee=erro`, req.url));

  const supabase = await createClient();
  const { data } = await supabase.from("lojas_canal").select("id").eq("id", loja).maybeSingle();
  if (!data) return NextResponse.redirect(new URL(`${volta}?shopee=erro`, req.url));

  const estado = randomBytes(16).toString("hex");
  const retorno = new URL("/api/shopee/callback", req.url);
  retorno.searchParams.set("loja", loja);
  retorno.searchParams.set("estado", estado);

  const res = NextResponse.redirect(urlAutorizacao(c, retorno.toString()));
  res.cookies.set("shopee_estado", estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/shopee" });
  res.cookies.set("shopee_volta", volta, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/shopee" });
  return res;
}
