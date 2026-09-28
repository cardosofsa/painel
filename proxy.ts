import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { gerarNonce, montarCsp, cabecalhoRelatorio } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  // Um nonce por requisição: reaproveitar entre páginas anularia a proteção, porque o
  // atacante só precisaria ler o nonce de uma resposta anterior.
  const nonce = gerarNonce();
  const politica = montarCsp(nonce);

  const resposta = await updateSession(request, { nonce, politica });
  resposta.headers.set("Content-Security-Policy", politica);
  // Dá nome ao grupo que `report-to` referencia. Sem ele o report-to não aponta pra lugar
  // nenhum e a violação se perde.
  resposta.headers.set("Reporting-Endpoints", cabecalhoRelatorio());
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
