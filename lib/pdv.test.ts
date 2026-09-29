import { describe, it, expect } from "vitest";
import {
  montarCards,
  dividirEmParcelas,
  calcularRestante,
  calcularTaxaMaquineta,
  type ProdutoPdv,
} from "./pdv";

function produto(p: Partial<ProdutoPdv> & { id: string }): ProdutoPdv {
  return {
    sku: p.id,
    nome: p.id,
    grupo_id: null,
    grupo_nome: null,
    variante_nome: null,
    preco_venda: 10,
    custo: 5,
    estoque: 1,
    imagem_url: null,
    categoria_nome: null,
    codigo_barras: null,
    garantia_dias: null,
    ...p,
  };
}

describe("montarCards", () => {
  it("produto sem grupo vira um card só dele, com a chave sendo o próprio id", () => {
    const [card] = montarCards([produto({ id: "a", nome: "Caneca" })]);
    expect(card.chave).toBe("a");
    expect(card.nome).toBe("Caneca");
    expect(card.variantes).toHaveLength(1);
  });

  it("variantes do mesmo grupo viram UM card — senão a grade mostra a mesma coisa 3 vezes", () => {
    const cards = montarCards([
      produto({ id: "p", grupo_id: "g", grupo_nome: "Camiseta", variante_nome: "P" }),
      produto({ id: "m", grupo_id: "g", grupo_nome: "Camiseta", variante_nome: "M" }),
      produto({ id: "gg", grupo_id: "g", grupo_nome: "Camiseta", variante_nome: "GG" }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].nome).toBe("Camiseta");
    expect(cards[0].variantes.map((v) => v.variante_nome)).toEqual(["P", "M", "GG"]);
  });

  it("faixa de preço cobre a menor e a maior variante", () => {
    const [card] = montarCards([
      produto({ id: "a", grupo_id: "g", grupo_nome: "Kit", preco_venda: 30 }),
      produto({ id: "b", grupo_id: "g", grupo_nome: "Kit", preco_venda: 10 }),
      produto({ id: "c", grupo_id: "g", grupo_nome: "Kit", preco_venda: 20 }),
    ]);
    expect(card.precoMin).toBe(10);
    expect(card.precoMax).toBe(30);
  });

  /**
   * O card some da grade quando `estoqueTotal` é zero. Somar o grupo é o que permite
   * continuar vendendo a única cor que sobrou.
   */
  it("estoque do card é a soma do grupo", () => {
    const [card] = montarCards([
      produto({ id: "a", grupo_id: "g", grupo_nome: "Kit", estoque: 0 }),
      produto({ id: "b", grupo_id: "g", grupo_nome: "Kit", estoque: 4 }),
    ]);
    expect(card.estoqueTotal).toBe(4);
  });

  it("usa a primeira imagem não-nula do grupo — sem isso o card fica vazio à toa", () => {
    const [card] = montarCards([
      produto({ id: "a", grupo_id: "g", grupo_nome: "Kit", imagem_url: null }),
      produto({ id: "b", grupo_id: "g", grupo_nome: "Kit", imagem_url: "https://x/foto.png" }),
    ]);
    expect(card.imagem_url).toBe("https://x/foto.png");
  });

  it("grupos diferentes não se misturam, mesmo com nome igual", () => {
    const cards = montarCards([
      produto({ id: "a", grupo_id: "g1", grupo_nome: "Camiseta" }),
      produto({ id: "b", grupo_id: "g2", grupo_nome: "Camiseta" }),
    ]);
    expect(cards).toHaveLength(2);
  });

  it("ordena por nome respeitando acento do português", () => {
    const nomes = montarCards([
      produto({ id: "c", nome: "Zíper" }),
      produto({ id: "a", nome: "Água" }),
      produto({ id: "b", nome: "Bola" }),
    ]).map((c) => c.nome);
    // Com comparação por código de caractere, "Água" cairia depois de "Zíper".
    expect(nomes).toEqual(["Água", "Bola", "Zíper"]);
  });

  it("lista vazia devolve lista vazia, não estoura", () => {
    expect(montarCards([])).toEqual([]);
  });

  it("usa o nome do produto quando o grupo não tem nome", () => {
    const [card] = montarCards([produto({ id: "a", nome: "Avulso", grupo_id: null, grupo_nome: null })]);
    expect(card.nome).toBe("Avulso");
  });
});

describe("dividirEmParcelas", () => {
  it("divide igual quando dá exato", () => {
    expect(dividirEmParcelas(300, 3)).toEqual([
      { numero: 1, valor: 100 },
      { numero: 2, valor: 100 },
      { numero: 3, valor: 100 },
    ]);
  });

  it("resto do arredondamento vai pra última parcela", () => {
    // 100 / 3 = 33,33... — duas de 33,33 e a última fecha a conta em 33,34.
    const parcelas = dividirEmParcelas(100, 3);
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(parcelas.reduce((acc, p) => acc + p.valor, 0)).toBeCloseTo(100, 10);
  });

  it("1 parcela devolve o valor cheio numa lista de um item", () => {
    expect(dividirEmParcelas(150, 1)).toEqual([{ numero: 1, valor: 150 }]);
  });

  it("número de parcelas menor que 1 vira 1, não quebra", () => {
    expect(dividirEmParcelas(150, 0)).toEqual([{ numero: 1, valor: 150 }]);
  });
});

describe("calcularRestante", () => {
  it("subtrai a entrada do total", () => {
    expect(calcularRestante(100, 30)).toBe(70);
  });

  it("nunca fica negativo — entrada maior que o total trava em zero", () => {
    expect(calcularRestante(100, 150)).toBe(0);
  });

  it("sem entrada, o restante é o total inteiro", () => {
    expect(calcularRestante(100, 0)).toBe(100);
  });
});

describe("calcularTaxaMaquineta", () => {
  it("calcula o percentual sobre o valor", () => {
    expect(calcularTaxaMaquineta(200, 4)).toBe(8);
  });

  it("taxa zero ou ausente não gera valor", () => {
    expect(calcularTaxaMaquineta(200, 0)).toBe(0);
  });

  it("taxa negativa é tratada como zero, não gera valor negativo", () => {
    expect(calcularTaxaMaquineta(200, -5)).toBe(0);
  });
});
