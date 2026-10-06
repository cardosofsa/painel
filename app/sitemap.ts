import type { MetadataRoute } from "next";
import { urlDoSite } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Sem endereço conhecido (desenvolvimento), sitemap vazio: link relativo não vale ali.
  const base = urlDoSite();
  if (!base) return [];
  return ["", "/signup", "/login", "/termos", "/privacidade"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
