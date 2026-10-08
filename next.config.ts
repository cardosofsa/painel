import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  experimental: {
    // Voltar para uma página já visitada (ou reabrir uma aba) usa o cache do navegador por 30 s
    // em vez de refazer todas as consultas. Toda mutação do app termina em `revalidatePath`, que
    // invalida esse cache: o dado alterado nunca aparece velho.
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    // As fotos de produto vivem no Storage do Supabase. Sem liberar o host aqui, o
    // next/image recusa a URL e a imagem não carrega.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    formats: ["image/avif", "image/webp"],
  },

  // Endereços antigos que ainda podem estar salvos nos favoritos.
  async redirects() {
    return [{ source: "/vixe/vitrine", destination: "/catalogo", permanent: true }];
  },

  /**
   * O app serve a vitrine pública (/vitrine/[slug]) na MESMA origem do painel autenticado.
   * Sem `X-Frame-Options`, um link de vitrine compartilhado no WhatsApp pode ser usado para
   * embutir /financeiro ou /configuracoes num iframe e capturar cliques do dono da conta.
   *
   * O Content-Security-Policy NÃO está aqui: ele leva um nonce diferente a cada
   * requisição, então é montado no `proxy.ts` (ver `lib/csp.ts`).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Negar por padrão evita que um script de terceiro injetado consiga pedir acesso.
          // Câmera só para a própria origem: leitor de código de barras do PDV no celular.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
