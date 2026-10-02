import { describe, expect, it } from "vitest";
import { aplicarRegras, montarPacote, type Cotacao } from "./tipos";
import { corpoCarrinho, cotacoesDoMelhorEnvio, erroDoMelhorEnvio } from "./melhor-envio";

describe("montarPacote", () => {
  it("empilha alturas, usa a maior base e soma o peso", () => {
    const r = montarPacote([
      { nome: "Caneca", quantidade: 2, peso_g: 350, altura_cm: 10, largura_cm: 12, comprimento_cm: 12 },
      { nome: "Pires", quantidade: 1, peso_g: 150, altura_cm: 2, largura_cm: 15, comprimento_cm: 15 },
    ]);
    expect(r.pacote).toEqual({ peso: 0.85, altura: 22, largura: 15, comprimento: 16 });
    expect(r.semMedida).toEqual([]);
  });

  it("produto sem medida usa o padrão e é avisado; respeita mínimos", () => {
    const r = montarPacote([{ nome: "Brinco", quantidade: 1, peso_g: 20, altura_cm: 1, largura_cm: 3, comprimento_cm: 3 }, { nome: "Sem medida", quantidade: 1, peso_g: null, altura_cm: null, largura_cm: null, comprimento_cm: null }]);
    expect(r.semMedida).toEqual(["Sem medida"]);
    expect(r.pacote.largura).toBe(11);
    expect(r.pacote.comprimento).toBe(16);
    expect(r.pacote.peso).toBe(0.32);
  });
});

const cot = (servicoId: number, valor: number, prazoDias = 5): Cotacao => ({ servicoId, servico: `S${servicoId}`, transportadora: "X", valor, prazoDias });

describe("aplicarRegras", () => {
  it("filtra serviços, soma acréscimo e ordena", () => {
    const r = aplicarRegras([cot(2, 30), cot(1, 20), cot(3, 10)], { servicos: [1, 2], acrescimo: 2.5, freteGratisAcima: null }, 100);
    expect(r.map((c) => [c.servicoId, c.valor])).toEqual([
      [1, 22.5],
      [2, 32.5],
    ]);
  });

  it("frete grátis no mais barato a partir do valor", () => {
    expect(aplicarRegras([cot(1, 20), cot(2, 30)], { servicos: [], acrescimo: 0, freteGratisAcima: 150 }, 149.99)[0].gratis).toBe(false);
    const r = aplicarRegras([cot(1, 20), cot(2, 30)], { servicos: [], acrescimo: 0, freteGratisAcima: 150 }, 150);
    expect([r[0].valor, r[0].gratis, r[1].valor]).toEqual([0, true, 30]);
  });
});

describe("Melhor Envio", () => {
  it("cotações: usa custom_price/prazo e ignora serviços com erro", () => {
    const r = cotacoesDoMelhorEnvio([
      { id: 1, name: "PAC", price: "25.60", custom_price: "27.10", delivery_time: 7, custom_delivery_time: 8, company: { name: "Correios" } },
      { id: 2, name: "SEDEX", price: "40.00", delivery_time: 2, company: { name: "Correios" } },
      { id: 3, name: ".Package", error: "Transportadora não atende este trecho." },
    ]);
    expect(r).toEqual([
      { servicoId: 1, servico: "PAC", transportadora: "Correios", valor: 27.1, prazoDias: 8 },
      { servicoId: 2, servico: "SEDEX", transportadora: "Correios", valor: 40, prazoDias: 2 },
    ]);
    expect(cotacoesDoMelhorEnvio({ message: "x" })).toEqual([]);
  });

  it("erros legíveis", () => {
    expect(erroDoMelhorEnvio({}, 401)).toMatch(/Token/);
    expect(erroDoMelhorEnvio({ message: "Dados inválidos", errors: { "to.postal_code": ["CEP inválido"] } }, 422)).toBe("Dados inválidos — CEP inválido");
  });

  it("carrinho: CNPJ vira company_document, CEP só dígitos", () => {
    const end = { nome: "Loja", documento: "12.345.678/0001-90", cep: "44000-000", endereco: "Rua A", numero: "1", bairro: "Centro", cidade: "Feira", uf: "BA" };
    const c = corpoCarrinho({ servicoId: 1, remetente: end, destinatario: { ...end, nome: "Cliente", documento: "123.456.789-01" }, pacote: { peso: 1, altura: 2, largura: 11, comprimento: 16 }, valorDeclarado: 50, produtos: [{ nome: "X", quantidade: 1, valor: 50 }], numeroPedido: "V-1" });
    expect(c.from).toMatchObject({ company_document: "12345678000190", postal_code: "44000000" });
    expect(c.to).toMatchObject({ document: "12345678901" });
    expect(c.volumes[0]).toEqual({ height: 2, width: 11, length: 16, weight: 1 });
  });
});

describe("assinatura da cotação", async () => {
  const { assinarCotacao, conferirCotacao } = await import("./assinatura");
  const base = { slug: "loja", cep: "44000000", servicoId: 1, servico: "PAC", valor: 22.5, prazoDias: 7, gratis: false };
  it("confere a própria e recusa valor trocado, outro segredo ou vencida", () => {
    const c = assinarCotacao(base, "s3gredo", 1000);
    expect(conferirCotacao(c, "s3gredo", 2000)).toBe(true);
    expect(conferirCotacao({ ...c, valor: 0.01 }, "s3gredo", 2000)).toBe(false);
    expect(conferirCotacao(c, "outro", 2000)).toBe(false);
    expect(conferirCotacao(c, "s3gredo", 1000 + 31 * 60_000)).toBe(false);
  });
});
