import { describe, expect, it } from "vitest";
import { descricaoDoItemShopee } from "./shopee-api";

describe("descricaoDoItemShopee", () => {
  it("usa a descrição normal", () => {
    expect(descricaoDoItemShopee({ description: "  Chá de camomila.  " })).toBe("Chá de camomila.");
  });

  it("na estendida, junta só os blocos de texto", () => {
    const d = descricaoDoItemShopee({
      description: "",
      description_info: { extended_description: { field_list: [{ field_type: "text", text: "Abertura" }, { field_type: "image" }, { field_type: "text", text: "Destaques" }] } },
    });
    expect(d).toBe("Abertura\n\nDestaques");
  });

  it("sem descrição, devolve null", () => {
    expect(descricaoDoItemShopee({})).toBeNull();
  });
});
