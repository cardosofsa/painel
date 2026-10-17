import { describe, expect, it } from "vitest";
import { PRESETS, REGRAS_BASE, normalizar, regrasAtivas, temBloqueio, verificarTextos } from "./termos";

const imagem = (texto: string, campo = "Capa 1") => ({ campo, texto, tipo: "imagem" as const });
const texto = (t: string, campo = "Título") => ({ campo, texto: t, tipo: "texto" as const });

describe("verificarTextos — base (qualquer nicho)", () => {
  const regras = regrasAtivas([], []);
  it("barra promoção e frete na imagem, mas não no título", () => {
    expect(verificarTextos([imagem("PROMOÇÃO: frete grátis hoje")], regras).map((v) => v.termo).sort()).toEqual(["frete grátis", "promoção"]);
    expect(verificarTextos([texto("Promoção relâmpago")], regras)).toEqual([]);
  });
  it("ignora acento e caixa", () => {
    expect(verificarTextos([imagem("PROMOCAO")], regras)[0]?.termo).toBe("promoção");
    expect(normalizar("Promoção")).toBe("promocao");
  });
  it("acha contato fora da plataforma em qualquer texto", () => {
    expect(verificarTextos([texto("Chame no WhatsApp")], regras)[0]).toMatchObject({ termo: "whatsapp", gravidade: "bloquear" });
    expect(verificarTextos([texto("ligue (11) 98765-4321")], regras).some((v) => v.termo === "telefone no texto")).toBe(true);
    expect(verificarTextos([texto("veja em https://loja.com")], regras).some((v) => v.termo === "link")).toBe(true);
  });
  it("palavra inteira: 'zap' não pega 'zapato'", () => {
    expect(verificarTextos([texto("Zapato de couro")], regras)).toEqual([]);
  });
  it("quantidade e medida não viram telefone", () => {
    expect(verificarTextos([texto("Kit com 100 unidades de 250 ml")], regras)).toEqual([]);
  });
});

describe("presets e termos do usuário", () => {
  it("sem preset ligado, nenhuma regra de saúde vale (nada de nicho escrito no código)", () => {
    expect(verificarTextos([texto("Chá que emagrece")], regrasAtivas([], []))).toEqual([]);
  });
  it("ligando o preset de saúde, acha a alegação e pede revisão", () => {
    const v = verificarTextos([texto("Chá que emagrece e desincha")], regrasAtivas(["saude"], []));
    expect(v.map((x) => x.termo).sort()).toEqual(["desincha", "emagrece"]);
    expect(v.every((x) => x.gravidade === "revisar" && x.origem === "preset")).toBe(true);
  });
  it("preset desconhecido é ignorado", () => {
    expect(regrasAtivas(["nao-existe"], []).length).toBe(REGRAS_BASE.length);
  });
  it("termo do usuário vale em texto e em imagem", () => {
    const regras = regrasAtivas([], ["Exclusivo", " x "]);
    expect(verificarTextos([texto("Modelo EXCLUSIVO"), imagem("exclusivo")], regras)).toHaveLength(2);
    expect(regras.filter((r) => r.origem === "usuario")).toHaveLength(1); // " x " é curto demais
  });
  it("a palavra inteira vale também para os termos dele", () => {
    expect(verificarTextos([texto("procura")], regrasAtivas(["saude"], []))).toEqual([]);
  });
});

describe("resultado", () => {
  it("não repete a mesma violação no mesmo campo e põe bloqueios primeiro", () => {
    const v = verificarTextos([texto("emagrece, emagrece e chame no zap")], regrasAtivas(["saude"], []));
    expect(v.filter((x) => x.termo === "emagrece")).toHaveLength(1);
    expect(v[0].gravidade).toBe("bloquear");
    expect(temBloqueio(v)).toBe(true);
  });
  it("texto vazio não gera nada; o trecho mostra o contexto", () => {
    expect(verificarTextos([texto("   ")], regrasAtivas([], []))).toEqual([]);
    const [v] = verificarTextos([texto("Fale com a gente pelo whatsapp para tirar dúvidas sobre o produto")], regrasAtivas([], []));
    expect(v.trecho).toContain("whatsapp");
  });
  it("todo preset tem termos e motivo", () => {
    for (const p of PRESETS) {
      expect(p.termos.length).toBeGreaterThan(0);
      expect(p.motivo).toBeTruthy();
    }
  });
});
