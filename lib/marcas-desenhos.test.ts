import { describe, expect, it } from "vitest";
import { MARCAS, marcaDoNome, type IdMarca } from "./marcas";
import { DESENHOS_MARCA } from "./marcas-desenhos";

const ids = Object.keys(DESENHOS_MARCA) as IdMarca[];

describe("DESENHOS_MARCA", () => {
  it("cada desenho é um path SVG válido (só comandos e números)", () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const d = DESENHOS_MARCA[id] ?? "";
      expect(d, id).toMatch(/^[Mm]/);
      expect(d, id).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    }
  });

  it("só guarda marca que o sistema consegue mostrar (reconhecida pelo nome)", () => {
    // Desenho de marca que nunca aparece é peso morto no JavaScript de todas as telas.
    for (const id of ids) expect(marcaDoNome(MARCAS[id].nome), id).toBe(id);
  });

  it("as marcas pedidas pelo id ou mais comuns continuam com desenho", () => {
    for (const id of ["shopee", "tiktok", "instagram", "whatsapp", "pix", "mercadopago"] as IdMarca[]) {
      expect(DESENHOS_MARCA[id], id).toBeTruthy();
    }
  });
});
