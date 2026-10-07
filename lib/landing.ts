/**
 * Peças opcionais da página inicial, ligadas por variável de ambiente pública. Puro e
 * coberto por `landing.test.ts`: sem a variável (ou com ela malformada), a peça não aparece.
 */

/** Origem do player do YouTube sem cookie de rastreio até o play. Entra em `frame-src`. */
export const ORIGEM_VIDEO_EMBED = "https://www.youtube-nocookie.com";
/** Miniaturas do YouTube (a "fachada" antes do clique). Entra em `img-src`. */
export const ORIGEM_VIDEO_MINIATURA = "https://i.ytimg.com";

/**
 * `NEXT_PUBLIC_WHATSAPP_CONTATO`: só dígitos com DDI (ex.: 5511999998888). Aceita a
 * pontuação de quem colou "+55 (11) 99999-8888", mas exige de 12 a 15 dígitos — sem DDI o
 * wa.me abre o número errado, e é melhor o botão sumir do que levar a um estranho.
 */
export function numeroWhatsappContato(bruto: string | null | undefined): string | null {
  const d = (bruto ?? "").replace(/\D/g, "");
  return d.length >= 12 && d.length <= 15 ? d : null;
}

export function linkWhatsappContato(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * Id do vídeo a partir de `NEXT_PUBLIC_VIDEO_DEMO_URL`. Aceita watch?v=, youtu.be/,
 * /embed/, /shorts/ e /live/, em youtube.com, m.youtube.com, youtu.be e youtube-nocookie.
 * Qualquer outra coisa devolve `null` (e o vídeo não aparece).
 */
export function idVideoYoutube(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const partes = u.pathname.split("/").filter(Boolean);
    if (partes[0] === "watch") id = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(partes[0] ?? "")) id = partes[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function urlEmbedVideo(id: string): string {
  return `${ORIGEM_VIDEO_EMBED}/embed/${id}?autoplay=1&rel=0`;
}

export function urlMiniaturaVideo(id: string): string {
  return `${ORIGEM_VIDEO_MINIATURA}/vi/${id}/hqdefault.jpg`;
}

/** O vídeo de demonstração está ligado? A CSP só abre o YouTube quando estiver. */
export function videoDemoAtivo(): boolean {
  return idVideoYoutube(process.env.NEXT_PUBLIC_VIDEO_DEMO_URL) !== null;
}
