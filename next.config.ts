import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    // As fotos de produto vivem no Storage do Supabase. Sem liberar o host aqui, o
    // next/image recusa a URL e a imagem não carrega.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    formats: ["image/avif", "image/webp"],
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
          // O app não usa nenhuma dessas APIs; negar por padrão evita que um script de
          // terceiro injetado consiga pedir acesso.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
