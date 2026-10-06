import { describe, expect, it } from "vitest";
import {
  FILTROS_PADRAO,
  agruparLinhas,
  aplicarFiltros,
  categoriasComContagem,
  codificarCarrinho,
  decodificarCarrinho,
  filtrosAtivos,
  limitesDePreco,
  montarCarrinho,
  textoConsultarProduto,
  trocarVariante,
  type LinhaCatalogoPublico,
  sugestoesCompreJunto,
} from "./vitrine-catalogo";
import { pedidoVitrineSchema } from "./vitrine-pedido";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const U4 = "44444444-4444-4444-8444-444444444444";
const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function linha(p: Partial<LinhaCatalogoPublico> & { produto_id: string }): LinhaCatalogoPublico {
  return {
    catalogo_nome: "Loja",
    produto_nome: "Produto",
    grupo_id: null,
    grupo_nome: null,
    variante_nome: null,
    descricao: null,
    imagem_url: null,
    categoria_nome: "Perfumes",
    preco: 10,
    imagens_extra: [],
    negocio_whatsapp: null,
    ordem_popularidade: null,
    catalogo_tipo_preco: "varejo",
    ...p,
  };
}

describe("agruparLinhas", () => {
  it("ignora a linha vazia do catálogo sem produtos", () => {
    expect(agruparLinhas([linha({ produto_id: null as unknown as string, produto_nome: null })])).toEqual([]);
  });

  it("variantes do mesmo grupo viram UM item com o menor preço COM preço", () => {
    const itens = agruparLinhas([
      linha({ produto_id: U1, produto_nome: "Camiseta", grupo_id: G1, variante_nome: "P", preco: 50 }),
      linha({ produto_id: U2, produto_nome: "Camiseta", grupo_id: G1, variante_nome: "M", preco: 40 }),
      linha({ produto_id: U3, produto_nome: "Camiseta", grupo_id: G1, variante_nome: "G", preco: null }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].preco).toBe(40);
    expect(itens[0].variantes).toHaveLength(3);
  });

  it("produto só com variantes 'Consultar' fica com preço nulo", () => {
    const [item] = agruparLinhas([linha({ produto_id: U1, preco: null })]);
    expect(item.preco).toBeNull();
  });

  it("guarda a melhor posição de popularidade do grupo; sem vendas vai pro fim", () => {
    const itens = agruparLinhas([
      linha({ produto_id: U1, grupo_id: G1, ordem_popularidade: 7 }),
      linha({ produto_id: U2, grupo_id: G1, ordem_popularidade: 2 }),
      linha({ produto_id: U3, ordem_popularidade: null }),
    ]);
    expect(itens.find((i) => i.produto_id === G1)?.ordem).toBe(2);
    expect(itens.find((i) => i.produto_id === U3)!.ordem).toBeGreaterThan(1000);
  });
});

describe("aplicarFiltros", () => {
  const itens = agruparLinhas([
    linha({ produto_id: U1, produto_nome: "Perfume Árabe", preco: 100, ordem_popularidade: 2, categoria_nome: "Perfumes" }),
    linha({ produto_id: U2, produto_nome: "Carteira", preco: 40, ordem_popularidade: 1, categoria_nome: "Couro" }),
    linha({ produto_id: U3, produto_nome: "Cinto", preco: null, ordem_popularidade: 3, categoria_nome: "Couro" }),
    linha({ produto_id: U4, produto_nome: "Bolsa", preco: 250, ordem_popularidade: null, categoria_nome: "Couro" }),
  ]);
  const nomes = (r: typeof itens) => r.map((i) => i.produto_nome);

  it("padrão é 'Mais pedidos': posição de popularidade, sem vendas por último", () => {
    expect(nomes(aplicarFiltros(itens, FILTROS_PADRAO))).toEqual(["Carteira", "Perfume Árabe", "Cinto", "Bolsa"]);
  });

  it("ordena por preço deixando 'Consultar' sempre no fim", () => {
    expect(nomes(aplicarFiltros(itens, { ...FILTROS_PADRAO, ordenacao: "menor" }))).toEqual([
      "Carteira", "Perfume Árabe", "Bolsa", "Cinto",
    ]);
    expect(nomes(aplicarFiltros(itens, { ...FILTROS_PADRAO, ordenacao: "maior" }))).toEqual([
      "Bolsa", "Perfume Árabe", "Carteira", "Cinto",
    ]);
  });

  it("busca ignora acento e caixa", () => {
    expect(nomes(aplicarFiltros(itens, { ...FILTROS_PADRAO, busca: "arabe" }))).toEqual(["Perfume Árabe"]);
  });

  it("filtra por categoria", () => {
    expect(nomes(aplicarFiltros(itens, { ...FILTROS_PADRAO, categoria: "Couro", ordenacao: "nome" }))).toEqual([
      "Bolsa", "Carteira", "Cinto",
    ]);
  });

  it("filtro de preço por faixa exclui 'Consultar' (não dá pra comparar)", () => {
    expect(nomes(aplicarFiltros(itens, { ...FILTROS_PADRAO, precoMin: 40, precoMax: 100, ordenacao: "menor" }))).toEqual([
      "Carteira", "Perfume Árabe",
    ]);
    expect(aplicarFiltros(itens, { ...FILTROS_PADRAO, precoMax: 1000 }).map((i) => i.produto_nome)).not.toContain("Cinto");
  });

  it("filtrosAtivos só liga com algo diferente do padrão (a ordenação não conta)", () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(false);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, ordenacao: "menor" })).toBe(false);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, precoMax: 10 })).toBe(true);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, busca: "x" })).toBe(true);
  });
});

describe("categoriasComContagem / limitesDePreco", () => {
  const itens = agruparLinhas([
    linha({ produto_id: U1, categoria_nome: "Perfumes", preco: 30 }),
    linha({ produto_id: U2, categoria_nome: null, preco: 90 }),
    linha({ produto_id: U3, categoria_nome: "Perfumes", preco: null }),
  ]);

  it("Todas primeiro, resto em ordem alfabética, sem categoria = Outros", () => {
    expect(categoriasComContagem(itens)).toEqual([
      { nome: "Todas", total: 3 },
      { nome: "Outros", total: 1 },
      { nome: "Perfumes", total: 2 },
    ]);
  });

  it("limites ignoram 'Consultar'; catálogo sem nenhum preço devolve null", () => {
    expect(limitesDePreco(itens)).toEqual({ min: 30, max: 90 });
    expect(limitesDePreco(agruparLinhas([linha({ produto_id: U1, preco: null })]))).toBeNull();
  });
});

describe("carrinho compartilhado", () => {
  it("codifica e decodifica ida e volta, sem caracteres que quebrem URL", () => {
    const cod = codificarCarrinho([{ produto_id: U1, quantidade: 2 }, { produto_id: U2, quantidade: 1 }]);
    expect(cod).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCarrinho(cod)).toEqual([
      { produto_id: U1, quantidade: 2 },
      { produto_id: U2, quantidade: 1 },
    ]);
  });

  it("código estragado ou malicioso vira carrinho vazio, nunca erro", () => {
    for (const ruim of ["", null, undefined, "!!!", "abc", btoa("não é json"), btoa('[["x",1]]'), btoa('[["' + U1 + '",0]]'), btoa('[["' + U1 + '",1000]]'), "a".repeat(5000)]) {
      expect(decodificarCarrinho(ruim as string)).toEqual([]);
    }
  });

  const itens = agruparLinhas([
    linha({ produto_id: U1, produto_nome: "Camiseta", grupo_id: G1, variante_nome: "P", preco: 50 }),
    linha({ produto_id: U2, produto_nome: "Camiseta", grupo_id: G1, variante_nome: "M", preco: 55 }),
    linha({ produto_id: U3, produto_nome: "Cinto", preco: null }),
    linha({ produto_id: U4, produto_nome: "Bolsa", preco: 250 }),
  ]);

  it("monta com nome e preço do catálogo de HOJE e descarta 'Consultar' e ids desconhecidos", () => {
    const carrinho = montarCarrinho(
      [
        { produto_id: U1, quantidade: 2 },
        { produto_id: U3, quantidade: 1 },
        { produto_id: "99999999-9999-4999-8999-999999999999", quantidade: 1 },
        { produto_id: U4, quantidade: 1 },
      ],
      itens,
    );
    expect(carrinho.map((i) => [i.produto_id, i.nome, i.preco, i.quantidade])).toEqual([
      [U1, "Camiseta — P", 50, 2],
      [U4, "Bolsa", 250, 1],
    ]);
    expect(carrinho[0].opcoes).toHaveLength(2);
    expect(carrinho[1].opcoes).toBeUndefined();
  });

  it("soma o mesmo produto repetido, respeitando o teto de 99", () => {
    const [i] = montarCarrinho([{ produto_id: U4, quantidade: 60 }, { produto_id: U4, quantidade: 60 }], itens);
    expect(i.quantidade).toBe(99);
  });

  it("trocarVariante muda id, nome e preço, e ignora opção que não existe", () => {
    const [linhaP] = montarCarrinho([{ produto_id: U1, quantidade: 1 }], itens);
    const trocada = trocarVariante(linhaP, U2);
    expect([trocada.produto_id, trocada.nome, trocada.preco]).toEqual([U2, "Camiseta — M", 55]);
    expect(trocarVariante(linhaP, "inexistente")).toBe(linhaP);
  });
});

describe("textoConsultarProduto", () => {
  it("cita produto, variante e catálogo", () => {
    expect(textoConsultarProduto("Camiseta", "Minha Loja", "P")).toContain('"Camiseta (P)"');
    expect(textoConsultarProduto("Camiseta", "Minha Loja")).toContain("catálogo Minha Loja");
  });
});

describe("pedidoVitrineSchema — e-mail e endereço opcionais", () => {
  const base = {
    slug: "loja",
    nome: "Maria",
    whatsapp: "(75) 99999-8888",
    observacao: null,
    idempotencia: "55555555-5555-4555-8555-555555555555",
    itens: [{ produto_id: U1, quantidade: 1 }],
  };

  it("pedido antigo, sem e-mail nem endereço, continua valendo", () => {
    const r = pedidoVitrineSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
      expect(r.data.cep).toBeNull();
      expect(r.data.uf).toBeNull();
    }
  });

  it("normaliza CEP (só dígitos), UF (maiúscula) e e-mail vazio (null)", () => {
    const r = pedidoVitrineSchema.safeParse({ ...base, email: "", cep: "40010-000", uf: "ba", cidade: "Salvador" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
      expect(r.data.cep).toBe("40010000");
      expect(r.data.uf).toBe("BA");
    }
  });

  it("recusa e-mail, CEP e UF inválidos", () => {
    expect(pedidoVitrineSchema.safeParse({ ...base, email: "sem-arroba" }).success).toBe(false);
    expect(pedidoVitrineSchema.safeParse({ ...base, cep: "123" }).success).toBe(false);
    expect(pedidoVitrineSchema.safeParse({ ...base, uf: "BAH" }).success).toBe(false);
  });
});

describe("compre junto", () => {
  const item = (id: string, categoria: string | null, ordem: number, preco: number | null = 10, variantes = [id]) => ({
    produto_id: id,
    produto_nome: id,
    descricao: null,
    imagem_url: null,
    categoria_nome: categoria,
    preco,
    imagens_extra: [],
    variantes: variantes.map((v) => ({ produto_id: v, variante_nome: null, preco, imagem_url: null, imagens_extra: [] })),
    ordem,
  });
  const caneca = item("caneca", "Cozinha", 1, 10, ["caneca", "caneca-verde"]);
  const itens = [caneca, item("colher", "Cozinha", 5), item("pires", "Cozinha", 2), item("prato", "Cozinha", 3, null), item("vela", "Casa", 1), item("pano", "Cozinha", 9)];

  it("pares vendidos juntos primeiro (de qualquer variante), depois a mesma categoria por popularidade", () => {
    const r = sugestoesCompreJunto(itens, [
      { produto_id: "caneca-verde", relacionado_id: "vela", posicao: 1 },
      { produto_id: "caneca", relacionado_id: "colher", posicao: 2 },
    ], caneca);
    expect(r.map((i) => i.produto_id)).toEqual(["vela", "colher", "pires"]);
  });

  it("sem pares: a categoria primeiro, depois os mais vendidos; sem 'Consultar' e sem o próprio item", () => {
    expect(sugestoesCompreJunto(itens, [], caneca, 4).map((i) => i.produto_id)).toEqual(["pires", "colher", "pano", "vela"]);
    expect(sugestoesCompreJunto(itens, [], item("x", null, 1)).map((i) => i.produto_id)).toEqual(["caneca", "vela", "pires"]);
    expect(sugestoesCompreJunto([caneca], [], caneca)).toEqual([]);
  });
});
