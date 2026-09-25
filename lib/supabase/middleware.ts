import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contaLiberada, podeAcessarRota, rotaEhLivre } from "@/lib/acesso";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Redirect que PRESERVA os cookies de sessão.
   *
   * `getUser()` acima pode renovar o token; quando isso acontece, o `setAll` grava os
   * cookies novos em `supabaseResponse`. Um `NextResponse.redirect()` cru cria uma resposta
   * nova e joga esses cookies fora — o navegador segue com o refresh token antigo que, com
   * rotação ligada, já foi invalidado. O sintoma é logout aleatório ou loop
   * /dashboard → /login, intermitente e difícil de reproduzir.
   */
  function redirecionarPara(destino: string) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    const resposta = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      resposta.cookies.set(cookie);
    }
    return resposta;
  }

  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/vitrine");
  const isAuthEntryRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (!user && !isPublicRoute) {
    return redirecionarPara("/login");
  }

  if (user && isAuthEntryRoute) {
    return redirecionarPara("/dashboard");
  }

  /**
   * Controle de acesso do lado do servidor. É aqui que a liberação por aba vale de fato:
   * o menu lateral só esconde o link, mas a URL continua digitável. Este é o único ponto
   * do app que tem sessão e caminho ao mesmo tempo, por isso a checagem mora aqui — ao
   * custo de uma consulta por navegação.
   */
  if (user && !isPublicRoute) {
    const { data: perfil } = await supabase
      .from("perfis_acesso")
      .select("papel, status, abas, expira_em")
      .eq("user_id", user.id)
      .maybeSingle();

    const liberada = perfil ? contaLiberada(perfil) : false;
    const naTelaDeEspera = pathname.startsWith("/aguardando");

    // Sem perfil (conta criada antes do trigger existir) vale como pendente: barra e
    // deixa o master decidir, em vez de liberar por omissão.
    if (!liberada) {
      if (naTelaDeEspera) return supabaseResponse;
      return redirecionarPara("/aguardando");
    }

    if (naTelaDeEspera) {
      return redirecionarPara("/dashboard");
    }

    if (rotaEhLivre(pathname) && perfil?.papel !== "master") {
      return redirecionarPara("/dashboard");
    }

    if (!podeAcessarRota(perfil?.abas ?? [], pathname)) {
      return redirecionarPara("/dashboard");
    }
  }

  return supabaseResponse;
}
