import { describe, expect, it } from "vitest";
import { lerDadosComprador, serializarDadosComprador, type DadosComprador } from "./dados-comprador";

const dados: DadosComprador = { nome: "Maria", whatsapp: "(11) 99999-8888", email: "m@x.com", cep: "01001-000", endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "SP" };

describe("dados do comprador guardados no aparelho", () => {
  it("vai e volta sem perder nada", () => {
    expect(lerDadosComprador(serializarDadosComprador(dados))).toEqual(dados);
  });
  it("nada guardado ou JSON quebrado vira null", () => {
    expect(lerDadosComprador(null)).toBeNull();
    expect(lerDadosComprador("{quebrado")).toBeNull();
    expect(lerDadosComprador("123")).toBeNull();
  });
  it("exige nome e WhatsApp com DDD", () => {
    expect(lerDadosComprador(JSON.stringify({ ...dados, nome: " " }))).toBeNull();
    expect(lerDadosComprador(JSON.stringify({ ...dados, whatsapp: "123" }))).toBeNull();
  });
  it("campos de endereço ausentes ou de tipo errado viram null, sem derrubar", () => {
    const r = lerDadosComprador(JSON.stringify({ nome: "A", whatsapp: "11999998888", cep: 123, uf: "SPX" }));
    expect(r).toMatchObject({ email: "", cep: null, endereco: null, uf: "SP" });
  });
  it("corta valores gigantes", () => {
    expect(lerDadosComprador(JSON.stringify({ ...dados, nome: "x".repeat(500) }))?.nome.length).toBe(120);
  });
});
