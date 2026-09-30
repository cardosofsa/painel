import { describe, it, expect } from "vitest";
import {
  senhaSchema,
  emailAuthSchema,
  novaSenhaSchema,
  movimentacaoEstoqueSchema,
  pedidoCompraSchema,
  periodoSchema,
  validar,
  iaContextoSchema,
  precoProdutoSchema,
  imagemProdutoSchema,
  concorrenteSchema,
  acaoEmMassaProdutosSchema,
  produtoSchema,
  vendaSchema,
  iaChaveSchema,
  iaCadastroSchema,
  canalLimitesSchema,
  SENHA_MIN,
  SENHA_MAX,
} from "./validacao";

describe("senhaSchema", () => {
  it(`recusa com menos de ${SENHA_MIN} caracteres`, () => {
    expect(senhaSchema.safeParse("1234567").success).toBe(false);
  });

  it(`aceita exatamente ${SENHA_MIN}`, () => {
    expect(senhaSchema.safeParse("12345678").success).toBe(true);
  });

  it(`recusa acima de ${SENHA_MAX} — o bcrypt trunca e daria falsa sensação de segurança`, () => {
    expect(senhaSchema.safeParse("a".repeat(SENHA_MAX)).success).toBe(true);
    expect(senhaSchema.safeParse("a".repeat(SENHA_MAX + 1)).success).toBe(false);
  });

  it("recusa espaço nas pontas, que costuma ser erro de digitação ou de colar", () => {
    expect(senhaSchema.safeParse(" senhaboa123").success).toBe(false);
    expect(senhaSchema.safeParse("senhaboa123 ").success).toBe(false);
    expect(senhaSchema.safeParse("senha boa 123").success).toBe(true);
  });
});

describe("emailAuthSchema", () => {
  it("normaliza para minúsculas e tira espaços", () => {
    expect(emailAuthSchema.parse("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
  });

  it("recusa endereço inválido", () => {
    expect(emailAuthSchema.safeParse("sem-arroba").success).toBe(false);
  });
});

describe("novaSenhaSchema", () => {
  it("recusa quando a confirmação não bate, apontando o campo certo", () => {
    const r = novaSenhaSchema.safeParse({ senha: "senhaboa123", confirmacao: "outracoisa1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["confirmacao"]);
  });

  it("aceita quando batem", () => {
    expect(novaSenhaSchema.safeParse({ senha: "senhaboa123", confirmacao: "senhaboa123" }).success).toBe(true);
  });
});

describe("movimentacaoEstoqueSchema", () => {
  it("recusa quantidade negativa — com tipo 'saida' ela INVERTIA o sinal e aumentava o estoque", () => {
    const r = movimentacaoEstoqueSchema.safeParse({
      produtoId: "11111111-1111-4111-8111-111111111111",
      tipo: "saida",
      quantidade: -5,
      motivo: "teste",
    });
    expect(r.success).toBe(false);
  });

  it("recusa quantidade fracionada e zero", () => {
    const base = { produtoId: "11111111-1111-4111-8111-111111111111", tipo: "entrada" as const, motivo: "" };
    expect(movimentacaoEstoqueSchema.safeParse({ ...base, quantidade: 1.5 }).success).toBe(false);
    expect(movimentacaoEstoqueSchema.safeParse({ ...base, quantidade: 0 }).success).toBe(false);
    expect(movimentacaoEstoqueSchema.safeParse({ ...base, quantidade: 1 }).success).toBe(true);
  });
});

describe("pedidoCompraSchema", () => {
  const base = {
    fornecedor_id: "11111111-1111-4111-8111-111111111111",
    armazem_id: null,
    nf: null,
    nf_arquivo_path: null,
    data_pedido: "2026-03-01",
    data_entrega_prevista: null,
    forma_pagamento: "Pix",
    conta_id: "22222222-2222-4222-8222-222222222222",
    parcelado: true,
    data_primeiro_vencimento: "2026-03-10",
    itens: [{ produto_id: null, produto_nome: "Camiseta", quantidade: 2, custo_unitario: 10 }],
  };

  it("impõe teto de parcelas — sem ele, um número enorme derrubava o processo por memória", () => {
    expect(pedidoCompraSchema.safeParse({ ...base, parcelas: 100_000_000 }).success).toBe(false);
    expect(pedidoCompraSchema.safeParse({ ...base, parcelas: 48 }).success).toBe(true);
  });

  it("exige pelo menos um item", () => {
    expect(pedidoCompraSchema.safeParse({ ...base, parcelas: 1, itens: [] }).success).toBe(false);
  });
});

describe("periodoSchema", () => {
  it("recusa data final anterior à inicial — alimenta um DELETE em massa", () => {
    expect(periodoSchema.safeParse({ dataInicio: "2026-03-10", dataFim: "2026-03-01" }).success).toBe(false);
    expect(periodoSchema.safeParse({ dataInicio: "2026-03-01", dataFim: "2026-03-10" }).success).toBe(true);
  });

  it("recusa formato que não seja AAAA-MM-DD", () => {
    expect(periodoSchema.safeParse({ dataInicio: "01/03/2026", dataFim: "10/03/2026" }).success).toBe(false);
  });
});

describe("validar", () => {
  it("lança com o caminho do campo aninhado, para o toast dizer onde está o erro", () => {
    expect(() =>
      validar(pedidoCompraSchema, {
        fornecedor_id: "11111111-1111-4111-8111-111111111111",
        armazem_id: null,
        nf: null,
        nf_arquivo_path: null,
        data_pedido: "2026-03-01",
        data_entrega_prevista: null,
        forma_pagamento: "Pix",
        conta_id: "22222222-2222-4222-8222-222222222222",
        parcelado: false,
        parcelas: null,
        data_primeiro_vencimento: "2026-03-10",
        itens: [{ produto_id: null, produto_nome: "X", quantidade: 0, custo_unitario: 1 }],
      }),
    ).toThrow(/itens\.0\.quantidade/);
  });
});

describe("iaContextoSchema", () => {
  const base = { produtoNome: "Camiseta Dry Fit" };

  it("aceita o mínimo: só o nome do produto", () => {
    expect(validar(iaContextoSchema, base).produtoNome).toBe("Camiseta Dry Fit");
  });

  it("exige nome de produto — sem ele a geração seria lixo pago", () => {
    expect(() => validar(iaContextoSchema, { produtoNome: "   " })).toThrow(/produtoNome/);
  });

  // Estes três são o FREIO DE CUSTO: o contexto chega do navegador, então sem teto um
  // cliente adulterado manda um prompt gigante na conta do sistema.
  it("recusa lista de concorrentes gigante", () => {
    const concorrentes = Array.from({ length: 500 }, (_, i) => ({ nome: `C${i}`, preco: 10 }));
    expect(() => validar(iaContextoSchema, { ...base, concorrentes })).toThrow(/concorrentes/);
  });

  it("recusa lista de componentes gigante", () => {
    const componentes = Array.from({ length: 200 }, (_, i) => ({ nome: `I${i}`, quantidade: 1 }));
    expect(() => validar(iaContextoSchema, { ...base, componentes })).toThrow(/componentes/);
  });

  it("recusa instrução livre gigante", () => {
    expect(() => validar(iaContextoSchema, { ...base, instrucaoExtra: "a".repeat(5000) })).toThrow(
      /instrucaoExtra/,
    );
  });

  it("recusa nome de produto gigante", () => {
    expect(() => validar(iaContextoSchema, { produtoNome: "a".repeat(5000) })).toThrow(/produtoNome/);
  });

  it("aceita null e undefined nos campos opcionais — o formulário manda os dois", () => {
    const r = validar(iaContextoSchema, { ...base, sku: null, categoria: undefined, custo: null });
    expect(r.sku).toBeNull();
  });
});

/**
 * Os quatro schemas abaixo cobrem actions que antes gravavam direto no banco, sem passar
 * por validação nenhuma, e cujos campos aparecem na vitrine pública ou no PDV.
 */
describe("precoProdutoSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("recusa preço negativo — entrava no banco e reaparecia na vitrine", () => {
    expect(() => validar(precoProdutoSchema, { produto_id: id, preco_venda: -10 })).toThrow(/negativo/);
  });

  it("recusa NaN, que escapa de `?? 0` e de `<= 0`", () => {
    expect(() => validar(precoProdutoSchema, { produto_id: id, preco_venda: NaN })).toThrow();
  });

  it("recusa Infinity", () => {
    expect(() => validar(precoProdutoSchema, { produto_id: id, preco_venda: Infinity })).toThrow();
  });

  it("recusa id que não é uuid", () => {
    expect(() => validar(precoProdutoSchema, { produto_id: "1 or 1=1", preco_venda: 10 })).toThrow();
  });

  it("aceita zero — produto de brinde tem preço zero", () => {
    expect(validar(precoProdutoSchema, { produto_id: id, preco_venda: 0 }).preco_venda).toBe(0);
  });
});

describe("urlPublica (imagem de produto e link de concorrente)", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  // `z.string().url()` sozinho aceita os dois: `new URL()` considera ambos válidos.
  it("recusa javascript:", () => {
    expect(() => validar(imagemProdutoSchema, { produto_id: id, url: "javascript:alert(1)" })).toThrow(
      /http/,
    );
  });

  it("recusa data:", () => {
    expect(() =>
      validar(imagemProdutoSchema, { produto_id: id, url: "data:text/html,<script>alert(1)</script>" }),
    ).toThrow(/http/);
  });

  it("aceita https do Storage", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/produtos/u/p-1.png";
    expect(validar(imagemProdutoSchema, { produto_id: id, url }).url).toBe(url);
  });

  it("vale também para produtoSchema.imagem_url, que usava só .url()", () => {
    expect(() =>
      validar(produtoSchema, {
        sku: "A1",
        nome: "Produto",
        categoria_id: null,
        fornecedor_id: null,
        armazem_id: null,
        custo_base: 1,
        insumos: [],
        preco_venda: 2,
        descricao: null,
        codigo_barras: null,
        imagem_url: "javascript:alert(1)",
        estoque: 0,
        estoque_minimo: 0,
        saida_media_semanal: 0,
        ativo: true,
        grupo_id: null,
        variante_nome: null,
        loja_ids: [],
      }),
    ).toThrow(/imagem_url/);
  });

  it("aceita link nulo no concorrente — o campo é opcional na tela", () => {
    const r = validar(concorrenteSchema, { produto_id: id, nome: "Loja X", preco: 50, link: null });
    expect(r.link).toBeNull();
  });
});

describe("acaoEmMassaProdutosSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("recusa lista vazia", () => {
    expect(() => validar(acaoEmMassaProdutosSchema, { ids: [], acao: "remover" })).toThrow();
  });

  // Sem teto a lista inteira vira querystring no PostgREST e volta 414.
  it("recusa mais de 500 ids", () => {
    const ids = Array.from({ length: 501 }, () => id);
    expect(() => validar(acaoEmMassaProdutosSchema, { ids, acao: "ativar" })).toThrow(/500/);
  });

  it("recusa ação fora da lista", () => {
    expect(() => validar(acaoEmMassaProdutosSchema, { ids: [id], acao: "apagar_tudo" })).toThrow();
  });
});

describe("vendaSchema — garantia por item", () => {
  const base = {
    itens: [{ produto_id: "8f1b7a52-3d4e-4c1a-9b7e-1a2b3c4d5e6f", quantidade: 1, preco_unitario: 10 }],
    status: "paga" as const,
    cliente_id: null,
    conta_id: null,
    forma_pagamento: "Pix",
    desconto: 0,
    valor_entrega: 0,
    observacao: null,
    data_vencimento: null,
    entrada_valor: 0,
    entrada_forma: null,
    forma_pagamento_2: null,
    parcelas_cartao: null,
    taxa_maquineta_pct: 0,
    parcelas_fiado: 1,
    dias_entre_parcelas: 30,
  };
  const comGarantia = (garantia_dias: unknown) => ({ ...base, itens: [{ ...base.itens[0], garantia_dias }] });

  it("aceita item sem o campo, com null e com dias válidos", () => {
    expect(vendaSchema.safeParse(base).success).toBe(true);
    expect(vendaSchema.safeParse(comGarantia(null)).success).toBe(true);
    expect(vendaSchema.safeParse(comGarantia(90)).success).toBe(true);
  });

  it("recusa zero, negativo, fracionário e acima de 10 anos", () => {
    for (const ruim of [0, -5, 1.5, 3651]) {
      expect(vendaSchema.safeParse(comGarantia(ruim)).success).toBe(false);
    }
  });
});

describe("schemas de cadastro de IA", () => {
  it("aceita chave normal e apara espaços nas pontas", () => {
    const r = iaChaveSchema.safeParse({ provedor: "openai", chave: "  sk-proj-abc123XYZ  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.chave).toBe("sk-proj-abc123XYZ");
  });

  it("recusa chave com espaço no meio, curta demais ou provedor desconhecido", () => {
    expect(iaChaveSchema.safeParse({ provedor: "openai", chave: "sk abc def ghi" }).success).toBe(false);
    expect(iaChaveSchema.safeParse({ provedor: "openai", chave: "curta" }).success).toBe(false);
    expect(iaChaveSchema.safeParse({ provedor: "grok", chave: "sk-abcdefgh" }).success).toBe(false);
  });

  it("modelo aceita ids do OpenRouter (com / e :) e recusa lixo", () => {
    const base = { provedor: "openrouter" as const, chave: "sk-or-v1-abcdefgh", padrao: true };
    expect(iaCadastroSchema.safeParse({ ...base, modelo: "google/gemini-2.5-flash:free" }).success).toBe(true);
    expect(iaCadastroSchema.safeParse({ ...base, modelo: "gpt-4.1-mini" }).success).toBe(true);
    expect(iaCadastroSchema.safeParse({ ...base, modelo: "modelo com espaço" }).success).toBe(false);
    expect(iaCadastroSchema.safeParse({ ...base, modelo: "https://evil.example/x" }).success).toBe(false);
    expect(iaCadastroSchema.safeParse({ ...base, modelo: "" }).success).toBe(false);
  });
});

describe("7.4: limites do canal, tom e palavras-chave", () => {
  it("limites do canal seguem o check do banco; vazio = sem limite próprio", () => {
    expect(validar(canalLimitesSchema, { limite_titulo: 60, limite_descricao: 10000 })).toEqual({
      limite_titulo: 60,
      limite_descricao: 10000,
    });
    expect(validar(canalLimitesSchema, { limite_titulo: null, limite_descricao: null }).limite_titulo).toBeNull();
    expect(() => validar(canalLimitesSchema, { limite_titulo: 10, limite_descricao: null })).toThrow(/mínimo 20/);
    expect(() => validar(canalLimitesSchema, { limite_titulo: null, limite_descricao: 20000 })).toThrow(/10.000/);
  });

  it("contexto da IA aceita tom conhecido e recusa inventado", () => {
    expect(validar(iaContextoSchema, { produtoNome: "X", tom: "premium", limite: 60 }).tom).toBe("premium");
    expect(() => validar(iaContextoSchema, { produtoNome: "X", tom: "agressivo" })).toThrow(/tom/);
  });

  it("produto guarda no máximo 20 palavras-chave", () => {
    const r = produtoSchema.shape.palavras_chave.safeParse(Array.from({ length: 21 }, (_, i) => `t${i}`));
    expect(r.success).toBe(false);
    expect(produtoSchema.shape.palavras_chave.safeParse(["camiseta", "dry fit"]).success).toBe(true);
    expect(produtoSchema.shape.palavras_chave.safeParse(undefined).success).toBe(true);
  });
});
