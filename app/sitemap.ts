import type { MetadataRoute } from "next";
import { urlDoSite } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sem endereço conhecido (desenvolvimento), sitemap vazio: link relativo não vale ali.
  const base = urlDoSite();
  if (!base) return [];
  return ["", "/calculadora", "/signup", "/login", "/termos", "/privacidade"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    // A calculadora é a página que se busca ("taxa Shopee"): logo abaixo da inicial.
    priority: p === "" ? 1 : p === "/calculadora" ? 0.8 : 0.5,
  }));
}
