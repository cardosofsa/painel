import { describe, expect, it } from "vitest";
import { idVideoYoutube, linkWhatsappContato, numeroWhatsappContato, urlEmbedVideo, urlMiniaturaVideo } from "./landing";

describe("numeroWhatsappContato", () => {
  it("aceita só dígitos com DDI e limpa pontuação", () => {
    expect(numeroWhatsappContato("5511999998888")).toBe("5511999998888");
    expect(numeroWhatsappContato("+55 (11) 99999-8888")).toBe("5511999998888");
  });
  it("sem variável ou sem DDI, some", () => {
    expect(numeroWhatsappContato(undefined)).toBeNull();
    expect(numeroWhatsappContato("")).toBeNull();
    expect(numeroWhatsappContato("11999998888")).toBeNull();
    expect(numeroWhatsappContato("1234567890123456")).toBeNull();
  });
  it("monta o wa.me com o texto escapado", () => {
    expect(linkWhatsappContato("5511999998888", "Oi, tudo bem?")).toBe("https://wa.me/5511999998888?text=Oi%2C%20tudo%20bem%3F");
  });
});

describe("idVideoYoutube", () => {
  const id = "dQw4w9WgXcQ";
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=10s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    ` https://youtu.be/${id} `,
  ])("extrai o id de %s", (url) => {
    expect(idVideoYoutube(url)).toBe(id);
  });

  it.each([undefined, "", "não é url", "https://vimeo.com/123", "https://evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://youtu.be/curto"])(
    "recusa %s",
    (url) => {
      expect(idVideoYoutube(url)).toBeNull();
    },
  );

  it("monta embed sem cookie e miniatura", () => {
    expect(urlEmbedVideo(id)).toBe(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`);
    expect(urlMiniaturaVideo(id)).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  });
});
