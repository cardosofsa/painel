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

  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/vitrine");
  const isAuthEntryRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthEntryRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
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
      const url = request.nextUrl.clone();
      url.pathname = "/aguardando";
      return NextResponse.redirect(url);
    }

    if (naTelaDeEspera) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (rotaEhLivre(pathname) && perfil?.papel !== "master") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (!podeAcessarRota(perfil?.abas ?? [], pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
