import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { credenciaisShopee, trocarCodigo } from "@/lib/marketplace/shopee-api";
import { aadToken } from "@/lib/marketplace/sincronizar";
import { cifrar } from "@/lib/ia/cofre";

function mesmoEstado(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Volta da autorização: troca o código por tokens, cifra e grava a conexão da loja. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const loja = p.get("loja") ?? "";
  const code = p.get("code") ?? "";
  const shopId = Number(p.get("shop_id"));
  const destino = (s: string) => {
    const res = NextResponse.redirect(new URL(`/vendas?shopee=${s}`, req.url));
    res.cookies.delete({ name: "shopee_estado", path: "/api/shopee" });
    return res;
  };

  const c = credenciaisShopee();
  if (!c) return destino("desligada");
  if (!mesmoEstado(p.get("estado") ?? "", req.cookies.get("shopee_estado")?.value ?? "")) return destino("erro");
  if (!code || !Number.isInteger(shopId) || shopId <= 0 || !/^[0-9a-f-]{36}$/i.test(loja)) return destino("erro");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return destino("erro");

  try {
    const t = await trocarCodigo(c, code, shopId);
    const aad = aadToken(user.id, loja);
    const linha = {
      user_id: user.id,
      loja_id: loja,
      plataforma: "shopee",
      shop_id: String(shopId),
      access_token_cifrado: cifrar(t.accessToken, aad),
      refresh_token_cifrado: cifrar(t.refreshToken, aad),
      expira_em: t.expiraEm,
      ultimo_erro: null,
    };
    const { error } = await supabase.from("marketplace_conexoes").upsert(linha, { onConflict: "user_id,loja_id" });
    if (error) throw new Error(error.message);
    return destino("conectada");
  } catch (e) {
    console.error("[shopee callback]", e instanceof Error ? e.message : e);
    return destino("erro");
  }
}
