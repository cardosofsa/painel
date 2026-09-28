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
