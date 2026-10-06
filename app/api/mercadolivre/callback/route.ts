import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { credenciaisML, trocarCodigoML } from "@/lib/marketplace/mercadolivre-api";
import { aadTokenML } from "@/lib/marketplace/tokens";
import { cifrar } from "@/lib/ia/cofre";
import { origemDaRequisicao } from "@/lib/origem";

function mesmoEstado(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Volta da autorização do Mercado Livre: troca o código por tokens, cifra e grava a conexão. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const origem = origemDaRequisicao(req.headers, req.nextUrl.origin);
  const code = p.get("code") ?? "";
  const loja = req.cookies.get("ml_loja")?.value ?? "";
  const volta = req.cookies.get("ml_volta")?.value === "/configuracoes" ? "/configuracoes" : "/vendas";
  const destino = (s: string) => {
    const res = NextResponse.redirect(new URL(`${volta}?shopee=${s}`, origem));
    for (const nome of ["ml_estado", "ml_loja", "ml_volta"]) res.cookies.delete({ name: nome, path: "/api/mercadolivre" });
    return res;
  };

  const c = credenciaisML();
  if (!c) return destino("ml_desligada");
  if (!mesmoEstado(p.get("state") ?? "", req.cookies.get("ml_estado")?.value ?? "")) return destino("ml_erro");
  if (!code || !/^[0-9a-f-]{36}$/i.test(loja)) return destino("ml_erro");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return destino("ml_erro");

  try {
    const t = await trocarCodigoML(c, code, new URL("/api/mercadolivre/callback", origem).toString());
    if (!t.userId || !t.refreshToken) throw new Error("Resposta sem user_id/refresh_token (marque offline_access no app).");
    const aad = aadTokenML(user.id, loja);
    const linha = {
      user_id: user.id,
      loja_id: loja,
      plataforma: "mercadolivre",
      shop_id: t.userId,
      access_token_cifrado: cifrar(t.accessToken, aad),
      refresh_token_cifrado: cifrar(t.refreshToken, aad),
      expira_em: t.expiraEm,
      ultimo_erro: null,
    };
    const { error } = await supabase.from("marketplace_conexoes").upsert(linha, { onConflict: "user_id,loja_id" });
    if (error) throw new Error(error.message);
    return destino("ml_conectada");
  } catch (e) {
    console.error("[mercadolivre callback]", e instanceof Error ? e.message : e);
    return destino("ml_erro");
  }
}
