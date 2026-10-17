import { describe, expect, it } from "vitest";
import {
  conferirEntradaCriacao,
  estaNaoListado,
  lerAtributos,
  lerCanais,
  lerCategorias,
  lerIdImagem,
  lerItemCriado,
  lerStatusItem,
  montarCorpoAddItem,
  traduzirErroShopee,
  type EntradaCriacao,
} from "./shopee-criar-puro";

const entrada: EntradaCriacao = {
  titulo: "Bolsa Tiracolo de Couro Caramelo",
  descricao: "Bolsa tiracolo de couro caramelo, ideal para o dia a dia. ".repeat(3),
  preco: 89.9,
  pesoG: 650,
  dimensoesCm: { altura: 20.2, largura: 30, comprimento: 10 },
  categoryId: 100123,
  atributos: [{ id: 1, valorId: 77 }, { id: 2, texto: "  Couro  " }],
  obrigatorios: [{ id: 1, nome: "Material" }],
  canais: [80001, 80003],
  imagens: ["img-capa", "img-2"],
  sku: " SKU-1 ",
  estoque: 12.7,
};

describe("montarCorpoAddItem", () => {
  const c = montarCorpoAddItem(entrada) as Record<string, unknown>;
  it("sempre pede o item como NÃO listado", () => {
    expect(c.item_status).toBe("UNLIST");
  });
  it("converte peso para kg, arredonda preço e estoque", () => {
    expect(c.weight).toBe(0.65);
    expect(c.original_price).toBe(89.9);
    expect(c.normal_stock).toBe(12);
  });
  it("monta imagens, frete, marca 'sem marca' e condição", () => {
    expect(c.image).toEqual({ image_id_list: ["img-capa", "img-2"] });
    expect(c.logistic_info).toEqual([{ logistic_id: 80001, enabled: true }, { logistic_id: 80003, enabled: true }]);
    expect(c.brand).toEqual({ brand_id: 0, original_brand_name: "NoBrand" });
    expect(c.condition).toBe("NEW");
    expect(c.category_id).toBe(100123);
  });
  it("atributos: valor da lista por id, texto livre por nome; sku sem espaços", () => {
    expect(c.attribute_list).toEqual([
      { attribute_id: 1, attribute_value_list: [{ value_id: 77 }] },
      { attribute_id: 2, attribute_value_list: [{ value_id: 0, original_value_name: "Couro" }] },
    ]);
    expect(c.item_sku).toBe("SKU-1");
  });
  it("dimensão só vai completa e arredondada para cima; senão não vai", () => {
    expect(c.dimension).toEqual({ package_height: 21, package_width: 30, package_length: 10 });
    expect(montarCorpoAddItem({ ...entrada, dimensoesCm: { altura: 20, largura: null, comprimento: 10 } })).not.toHaveProperty("dimension");
  });
  it("sem atributos nem sku, esses campos não vão", () => {
    const s = montarCorpoAddItem({ ...entrada, atributos: [{ id: 5 }], sku: null });
    expect(s).not.toHaveProperty("attribute_list");
    expect(s).not.toHaveProperty("item_sku");
  });
  it("no máximo 9 imagens e estoque nunca negativo", () => {
    const s = montarCorpoAddItem({ ...entrada, imagens: Array.from({ length: 12 }, (_, i) => `i${i}`), estoque: -5 }) as Record<string, unknown>;
    expect((s.image as { image_id_list: string[] }).image_id_list).toHaveLength(9);
    expect(s.normal_stock).toBe(0);
  });
});

describe("conferirEntradaCriacao", () => {
  it("entrada completa não tem pendência", () => {
    expect(conferirEntradaCriacao(entrada)).toEqual([]);
  });
  it("lista o que falta, em português", () => {
    const falta = conferirEntradaCriacao({ ...entrada, titulo: "", descricao: "curta", preco: null, pesoG: 0, categoryId: null, canais: [], imagens: [] });
    expect(falta).toHaveLength(7);
    expect(falta.join(" ")).toContain("título");
    expect(falta.join(" ")).toContain("canal de frete");
    expect(falta.join(" ")).toContain("capa");
  });
  it("atributo obrigatório sem valor é cobrado pelo nome", () => {
    expect(conferirEntradaCriacao({ ...entrada, atributos: [] })).toEqual(["Preencha o atributo obrigatório “Material”."]);
    expect(conferirEntradaCriacao({ ...entrada, atributos: [{ id: 1, texto: "   " }] })).toHaveLength(1);
  });
});

describe("leitura das respostas", () => {
  it("categorias", () => {
    const r = lerCategorias({ category_list: [{ category_id: 1, parent_category_id: 0, display_category_name: "Bolsas", has_children: true }, { category_id: "2", parent_category_id: 1, original_category_name: "Tiracolo", has_children: false }, { category_id: 3 }, "x"] });
    expect(r).toEqual([{ id: 1, paiId: 0, nome: "Bolsas", temFilhas: true }, { id: 2, paiId: 1, nome: "Tiracolo", temFilhas: false }]);
  });
  it("atributos: tipo, obrigatoriedade e valores", () => {
    const r = lerAtributos({
      list: [{ category_id: 1, attribute_tree: [
        { attribute_id: 10, display_attribute_name: "Material", is_mandatory: true, input_type: "DROP_DOWN", attribute_value_list: [{ value_id: 1, display_value_name: "Couro" }, { value_id: 2, original_value_name: "Tecido" }] },
        { attribute_id: 11, original_attribute_name: "Observação", is_mandatory: false, input_type: "TEXT_FILED", attribute_value_list: [] },
        { attribute_id: 12, original_attribute_name: "Cores", input_type: "MULTIPLE_SELECT", attribute_value_list: [{ value_id: 5, original_value_name: "Azul" }] },
      ] }],
    });
    expect(r.map((a) => [a.id, a.obrigatorio, a.tipo, a.valores.length])).toEqual([[10, true, "lista", 2], [11, false, "texto", 0], [12, false, "multipla", 1]]);
  });
  it("canais de frete", () => {
    expect(lerCanais({ logistics_channel_list: [{ logistics_channel_id: 80001, logistics_channel_name: "Padrão", enabled: true }, { logistics_channel_id: 80003, logistics_channel_name: "Retira", enabled: false }, {}] })).toEqual([
      { id: 80001, nome: "Padrão", habilitado: true },
      { id: 80003, nome: "Retira", habilitado: false },
    ]);
  });
  it("id da imagem: forma única e em lista", () => {
    expect(lerIdImagem({ image_info: { image_id: "abc" } })).toBe("abc");
    expect(lerIdImagem({ image_info_list: [{ image_info: { image_id: "xyz" } }] })).toBe("xyz");
    expect(lerIdImagem({})).toBeNull();
  });
  it("item criado e status", () => {
    expect(lerItemCriado({ item_id: 123456 })).toBe(123456);
    expect(lerItemCriado({})).toBeNull();
    expect(lerStatusItem({ item_list: [{ item_id: 1, item_status: "unlist" }] })).toBe("UNLIST");
    expect(lerStatusItem({ item_list: [] })).toBeNull();
  });
  it("só UNLIST conta como não listado (NORMAL é listado ao vivo)", () => {
    expect(estaNaoListado("UNLIST")).toBe(true);
    expect(estaNaoListado("NORMAL")).toBe(false);
    expect(estaNaoListado(null)).toBe(false);
  });
});

describe("traduzirErroShopee", () => {
  it("permissão, autorização, parâmetro e limite viram orientação", () => {
    expect(traduzirErroShopee("Shopee: error_permission")).toContain("não tem permissão");
    expect(traduzirErroShopee("Shopee: Invalid access_token")).toContain("Conecte a loja de novo");
    expect(traduzirErroShopee("Shopee: error_param category_id")).toContain("recusou um dado");
    expect(traduzirErroShopee("Shopee: too many requests")).toContain("Espere um minuto");
  });
  it("erro desconhecido mostra o que a Shopee disse", () => {
    expect(traduzirErroShopee("Shopee: algo diferente")).toBe("A Shopee respondeu: algo diferente");
  });
});
