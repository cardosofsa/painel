import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contaLiberada, podeAcessarRota, rotaEhLivre, type StatusConta } from "@/lib/acesso";
import { assinarAcesso, CABECALHO_ACESSO, COOKIE_ACESSO, lerAcesso, segredoAcesso, VALIDADE_ACESSO_MS } from "@/lib/acesso-cookie";
import { COOKIE_OPERADOR, lerOperador, operadorPodeRota, telaInicialOperador } from "@/lib/operador-cookie";

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
  // Quem é o usuário, para as páginas não irem de novo ao Auth e a `perfis_acesso`.
  // SEMPRE reescrito aqui: o valor que vier do navegador é descartado.
  let acessoParaPaginas: string | null = null;

  function proximaResposta() {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", csp.nonce);
    headers.set("Content-Security-Policy", csp.politica);
    headers.delete(CABECALHO_ACESSO);
    if (acessoParaPaginas) headers.set(CABECALHO_ACESSO, acessoParaPaginas);
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

  // `getClaims()` valida o JWT com a chave pública do projeto (ES256), sem ir ao servidor de
  // Auth a cada navegação como o `getUser()` ia. Também renova a sessão vencida (setAll).
  const { data: dadosClaims } = await supabase.auth.getClaims();
  const claims = dadosClaims?.claims;
  const user = claims?.sub ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null } : null;

  /**
   * Redirect que PRESERVA os cookies de sessão.
   *
   * `getClaims()` acima pode renovar o token; quando isso acontece, o `setAll` grava os
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
  // A página inicial é pública: o Google exige que ela explique a finalidade do app. Quem já
  // tem sessão é mandado para /dashboard pela própria página.
  const isPublicRoute = pathname === "/" || ehOuComeca(pathname, [
    "/login",
    "/signup",
    "/recuperar",
    "/auth/callback",
    "/auth/reset",
    "/vitrine",
    // Exigidas pelo Google (e pela LGPD) para publicar o login: precisam abrir sem sessão.
    "/privacidade",
    "/termos",
    // Quem faz o pedido é o cliente final, que nunca teve login. Sem esta linha o POST
    // viraria um redirect para /login e o carrinho nunca enviaria.
    "/api/vitrine",
    // O navegador reporta violação de CSP sem sessão. Sem esta linha o relatório viraria
    // um redirect para /login e a violação nunca chegaria ao log.
    "/api/csp-report",
    // Instalar o app no celular: o navegador busca o manifesto sem sessão.
    "/manifest.webmanifest",
    // Service worker do PDV sem internet (11.4): o navegador busca sem sessão.
    "/sw.js",
    // Cron da Vercel (sem sessão): a rota exige o CRON_SECRET no cabeçalho.
    "/api/cron",
    // Notificações do Mercado Livre (sem sessão): a rota relê o pedido na API, não confia no corpo.
    "/api/mercadolivre/notificacoes",
    // Webhook do provedor de cobrança (10.9): valida a assinatura do evento; sem provedor, 404.
    "/api/cobranca/webhook",
    // Buscadores e prévias de link (WhatsApp, redes) leem estes sem sessão.
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
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
   * custo de uma consulta a cada 2 min (o perfil fica num cookie assinado entre uma e outra).
   */
  if (user && !isPublicRoute) {
    // Perfil do cookie assinado (vale 2 min); vencido ou ausente, busca no banco e renova.
    const segredo = segredoAcesso();
    let perfil: { papel: "master" | "usuario"; status: StatusConta; abas: string[]; expira_em: string | null; exige?: boolean } | null = null;
    let renovarCookie = false;
    const cache = segredo ? await lerAcesso(request.cookies.get(COOKIE_ACESSO)?.value, segredo, user.id) : null;
    if (cache) perfil = { papel: cache.p, status: cache.s as StatusConta, abas: cache.a, expira_em: cache.e, exige: !!cache.q };
    else {
      const [{ data }, { data: negocio }] = await Promise.all([
        supabase.from("perfis_acesso").select("papel, status, abas, expira_em").eq("user_id", user.id).maybeSingle(),
        // `*`: exigir_operador só existe a partir da 0063.
        supabase.from("perfil_negocio").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      perfil = data ? { papel: data.papel, status: data.status, abas: data.abas ?? [], expira_em: data.expira_em, exige: !!(negocio as { exigir_operador?: boolean } | null)?.exigir_operador } : null;
      // Só quem está liberado vai para o cache: quem espera aprovação vê a liberação na hora.
      renovarCookie = !!(segredo && perfil && contaLiberada(perfil));
    }

    // Passa às páginas e ao layout quem é (id, e-mail, papel, abas), preservando os
    // cookies que o Supabase acabou de gravar na resposta.
    // Operador (11.8): quem está operando, pelo cookie assinado do turno.
    const operador = segredo ? await lerOperador(request.cookies.get(COOKIE_OPERADOR)?.value, segredo, user.id) : null;
    acessoParaPaginas = encodeURIComponent(
      JSON.stringify({
        userId: user.id,
        email: user.email,
        papel: perfil?.papel ?? "usuario",
        abas: perfil?.abas ?? [],
        operador: operador ? { id: operador.o, nome: operador.n, abas: operador.a } : null,
        exigeOperador: !!perfil?.exige,
      }),
    );
    const gravados = supabaseResponse.cookies.getAll();
    supabaseResponse = proximaResposta();
    for (const c of gravados) supabaseResponse.cookies.set(c);
    if (renovarCookie && segredo && perfil) {
      supabaseResponse.cookies.set(COOKIE_ACESSO, await assinarAcesso({ u: user.id, p: perfil.papel, s: perfil.status, e: perfil.expira_em, a: perfil.abas, q: !!perfil.exige }, segredo), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(VALIDADE_ACESSO_MS / 1000),
      });
    }

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

    // Operadores (11.8): o turno limita as telas; a loja pode exigir alguém operando.
    if (perfil?.papel !== "master") {
      const naTelaOperador = ehOuComeca(pathname, ["/operador"]);
      if (operador && !operadorPodeRota(operador.a, pathname)) return redirecionarPara(telaInicialOperador(operador.a));
      // O dono também "entra" (turno assinado com o id "dono" e todas as telas).
      if (!operador && perfil?.exige && !naTelaOperador) return redirecionarPara("/operador");
    }
  }

  return supabaseResponse;
}
