import type { MetadataRoute } from "next";

/** Instalar o SERTÃO na tela inicial do celular, com o símbolo da marca. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SERTÃO — gestão para quem vende online",
    short_name: "SERTÃO",
    description: "Precificação, estoque, vendas, catálogo e financeiro para pequenos negócios.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2f5a2b",
    lang: "pt-BR",
    icons: [
      { src: "/marca/sertao-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/sertao.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
