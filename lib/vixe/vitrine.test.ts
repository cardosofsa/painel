import { describe, expect, it } from "vitest";
import { normalizarSecoes, secoesVazias } from "./vitrine";
import { hashContextoVitrine, interpretarVitrine, montarPromptVitrine } from "@/lib/ia/prompts-vitrine";

describe("normalizarSecoes", () => {
  it("mantém o formato válido e corta nos limites", () => {
    const s = normalizarSecoes({
      destaque: { titulo: "Doces caseiros feitos com carinho", subtitulo: "Encomende pelo WhatsApp" },
      sobre: { texto: "palavra ".repeat(200) },
      diferenciais: [
        { titulo: "Receita de família", texto: "Desde 1998." },
        { titulo: "", texto: "sem título some" },
        { titulo: "A", texto: "B" },
        { titulo: "C", texto: "D" },
        { titulo: "E", texto: "F" },
      ],
      chamada: { texto: "Peça já" },
    });
    expect(s.destaque).toEqual({ titulo: "Doces caseiros feitos com carinho", subtitulo: "Encomende pelo WhatsApp" });
    expect(s.sobre!.texto.length).toBeLessThanOrEqual(600);
    expect(s.diferenciais).toHaveLength(3);
    expect(s.diferenciais![0].titulo).toBe("Receita de família");
    expect(s.rodape).toBeUndefined();
  });

  it("HTML vira texto e lixo vira vazio", () => {
    expect(normalizarSecoes({ sobre: { texto: "<script>alert(1)</script>Olá <b>mundo</b>" } }).sobre?.texto).toBe("alert(1)Olá mundo");
    expect(normalizarSecoes("lixo")).toEqual({});
    expect(normalizarSecoes([1, 2])).toEqual({});
    expect(secoesVazias(normalizarSecoes(null))).toBe(true);
  });
});

describe("prompt e leitura da vitrine", () => {
  const ctx = { segmento: "doces caseiros", estilo: "rustico" as const, diferenciais: null };

  it("proíbe inventar diferencial e HTML", () => {
    const p = montarPromptVitrine(ctx);
    expect(p).toContain("não pode ser inventado");
    expect(p).toContain("sem HTML");
    expect(p).toContain("Rústico");
  });

  it("lê tema e seções da mesma resposta", () => {
    const r = interpretarVitrine(
      JSON.stringify({
        cor_primaria: "#aa5500",
        cor_fundo: "#fffaf0",
        cor_superficie: "#ffffff",
        cor_texto: "#2b1d0e",
        fonte: "lora",
        titulo: "Doce Sertão",
        secoes: { destaque: { titulo: "Feito em casa" } },
      }),
    );
    expect(r.tema.corPrimaria).toBe("#aa5500");
    expect(r.tema.fonte).toBe("lora");
    expect(r.secoes.destaque?.titulo).toBe("Feito em casa");
  });

  it("hash muda com as respostas do dono", () => {
    expect(hashContextoVitrine(ctx)).not.toBe(hashContextoVitrine({ ...ctx, estilo: "moderno" }));
  });
});
