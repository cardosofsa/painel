import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { gerarNonce, montarCsp } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  // Um nonce por requisição: reaproveitar entre páginas anularia a proteção, porque o
  // atacante só precisaria ler o nonce de uma resposta anterior.
  const nonce = gerarNonce();
  const politica = montarCsp(nonce);

  const resposta = await updateSession(request, { nonce, politica });
  resposta.headers.set("Content-Security-Policy", politica);
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
