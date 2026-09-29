import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contaLiberada, podeAcessarRota, rotaEhLivre } from "@/lib/acesso";

/**
 * Casa o caminho exato ou um filho dele (`/vitrine` e `/vitrine/abc`, nunca
 * `/vitrine-admin`). Era `startsWith` cru, que liberaria sem sessão qualquer rota nova
 * cujo nome apenas começasse igual — hoje não existe nenhuma, e o objetivo é que continue
 * não existindo por construção, não por sorte.
 */
function ehOuComeca(pathname: string, bases: string[]): boolean {
  return bases.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export async function updateSession(request: NextRequest, csp: { nonce: string; politica: string }) {
  /**
   * O nonce e a política precisam ir TAMBÉM nos cabeçalhos da requisição, não só na
   * resposta: é de lá que o Next lê o nonce para carimbar nas tags <script> que ele mesmo
   * injeta. Só no cabeçalho da resposta, o HTML sairia com script sem nonce e a CSP
   * derrubaria a hidratação — página em branco.
   *
   * Refaz o snapshot a cada chamada de propósito: o `setAll` do Supabase grava os cookies
   * renovados em `request.cookies`, que por baixo reescreve o cabeçalho `cookie`. Capturar
   * os headers uma vez lá em cima perderia a sessão renovada.
   */
  function proximaResposta() {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", csp.nonce);
    headers.set("Content-Security-Policy", csp.politica);
    return NextResponse.next({ request: { headers } });
  }

  let supabaseResponse = proximaResposta();

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
          supabaseResponse = proximaResposta();
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

  /**
   * `/recuperar` e `/auth/reset` precisam ser públicas por um motivo que só aparece com
   * conta de outra pessoa: sem isso, o bloco `user && !isPublicRoute` lá embaixo consulta
   * `perfis_acesso` e manda quem está `pendente`, `suspenso` ou vencido para `/aguardando`
   * — ou seja, a conta suspensa NUNCA conseguiria trocar a senha, que é justamente o caso
   * em que trocar mais importa. Testar só com a conta master esconde isso, porque para
   * conta ativa a página abre normalmente.
   */
  const isPublicRoute = ehOuComeca(pathname, [
    "/login",
    "/signup",
    "/recuperar",
    "/auth/callback",
    "/auth/reset",
    "/vitrine",
    // Quem faz o pedido é o cliente final, que nunca teve login. Sem esta linha o POST
    // viraria um redirect para /login e o carrinho nunca enviaria.
    "/api/vitrine",
    // O navegador reporta violação de CSP sem sessão. Sem esta linha o relatório viraria
    // um redirect para /login e a violação nunca chegaria ao log.
    "/api/csp-report",
  ]);

  /**
   * Só login e cadastro. `/auth/reset` NÃO pode entrar aqui: nesse ponto o usuário já tem
   * sessão — criada pelo próprio link de recuperação —, então a regra
   * `user && isAuthEntryRoute → /dashboard` expulsaria exatamente quem precisa da tela,
   * tornando a redefinição de senha inalcançável por construção.
   */
  const isAuthEntryRoute = ehOuComeca(pathname, ["/login", "/signup"]);

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
    const naTelaDeEspera = ehOuComeca(pathname, ["/aguardando"]);

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
