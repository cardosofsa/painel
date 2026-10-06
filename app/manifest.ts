import type { MetadataRoute } from "next";

/** Instalar o Sertão na tela inicial do celular, com o símbolo da marca. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sertão — gestão para quem vende online",
    short_name: "Sertão",
    description: "Precificação, estoque, vendas, catálogo e financeiro para pequenos negócios.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafafa",
    // Mesmos valores de --background e --accent (globals.css), para a barra do app instalado
    // combinar com a tela.
    theme_color: "#3b4d1f",
    lang: "pt-BR",
    icons: [
      { src: "/marca/sertao-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/sertao.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
