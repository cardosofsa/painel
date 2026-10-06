import type { MetadataRoute } from "next";
import { urlDoSite } from "@/lib/site";

/** Só as páginas públicas interessam aos buscadores; o painel exige login de qualquer jeito. */
export default function robots(): MetadataRoute.Robots {
  const base = urlDoSite();
  return {
    rules: { userAgent: "*", allow: ["/", "/termos", "/privacidade", "/vitrine/"], disallow: ["/api/", "/dashboard", "/auth/"] },
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
