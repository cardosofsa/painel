import { describe, expect, it } from "vitest";
import { MARCAS, marcaDoNome } from "./marcas";

describe("marcaDoNome", () => {
  it("reconhece marketplaces pelo nome do canal ou loja", () => {
    expect(marcaDoNome("Shopee")).toBe("shopee");
    expect(marcaDoNome("Shopee — cardosoeshop")).toBe("shopee");
    expect(marcaDoNome("MERCADO LIVRE")).toBe("mercadolivre");
    expect(marcaDoNome("Mercado Libre")).toBe("mercadolivre");
    expect(marcaDoNome("Magazine Luiza")).toBe("magalu");
    expect(marcaDoNome("TikTok Shop")).toBe("tiktok");
    expect(marcaDoNome("Amazon BR")).toBe("amazon");
  });
  it("Mercado Pago não vira Mercado Livre", () => {
    expect(marcaDoNome("Mercado Pago")).toBe("mercadopago");
  });
  it("redes e pagamento", () => {
    expect(marcaDoNome("@loja no Instagram")).toBe("instagram");
    expect(marcaDoNome("WhatsApp")).toBe("whatsapp");
    expect(marcaDoNome("Pix")).toBe("pix");
  });
  it("não inventa marca", () => {
    expect(marcaDoNome("Loja física")).toBeNull();
    expect(marcaDoNome("PDV")).toBeNull();
    expect(marcaDoNome("Fixa")).toBeNull();
    expect(marcaDoNome("")).toBeNull();
    expect(marcaDoNome(null)).toBeNull();
  });
  it("toda marca tem cor e sigla", () => {
    for (const m of Object.values(MARCAS)) {
      expect(m.cor).toMatch(/^[0-9A-F]{6}$/);
      expect(m.sigla.length).toBeGreaterThan(0);
    }
  });
});
