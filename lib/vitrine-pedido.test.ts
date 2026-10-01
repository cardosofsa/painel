import { describe, it, expect } from "vitest";
import {
  consolidarCarrinho,
  totalCarrinho,
  quantidadeTotal,
  pedidoVitrineSchema,
  textoPedidoVitrine,
  linkPedidoWhatsapp,
  MAX_ITENS,
  MAX_QTD,
  MAX_NOME,
  MAX_OBSERVACAO,
  MAX_URL_WHATSAPP,
  type ItemCarrinhoVitrine,
} from "./vitrine-pedido";
import { validar } from "./validacao";
import { formatBRL } from "./format";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

function item(p: Partial<ItemCarrinhoVitrine> = {}): ItemCarrinhoVitrine {
  return { produto_id: UUID, nome: "Camiseta", preco: 10, quantidade: 1, ...p };
}

describe("consolidarCarrinho", () => {
  /**
   * `registrar_venda` agrega por produto antes de conferir estoque porque validar linha a
   * linha deixaria passar 3 + 3 com estoque 5. Consolidar aqui faz o pedido, a mensagem e
   * a venda contarem a mesma história.
   */
  it("soma o mesmo SKU adicionado duas vezes", () => {
    const r = consolidarCarrinho([item({ quantidade: 3 }), item({ quantidade: 3 })]);
    expect(r).toHaveLength(1);
    expect(r[0].quantidade).toBe(6);
  });

  it("mantém SKUs diferentes separados", () => {
    const r = consolidarCarrinho([item(), item({ produto_id: UUID2, nome: "Cinto" })]);
    expect(r).toHaveLength(2);
  });

  it("não muta a lista original", () => {
    const original = [item({ quantidade: 2 }), item({ quantidade: 2 })];
    consolidarCarrinho(original);
    expect(original[0].quantidade).toBe(2);
  });

  it("carrinho vazio devolve vazio", () => {
    expect(consolidarCarrinho([])).toEqual([]);
  });
});

describe("totalCarrinho", () => {
  it("multiplica preço por quantidade e soma", () => {
    expect(totalCarrinho([item({ preco: 19.9, quantidade: 2 }), item({ produto_id: UUID2, preco: 5, quantidade: 3 })])).toBe(
      54.8,
    );
  });

  // 0.1 + 0.2 em ponto flutuante é 0.30000000000000004; arredondar por linha evita
  // o total sair com um centavo fantasma na tela do cliente.
  it("não acumula erro de ponto flutuante", () => {
    expect(totalCarrinho([item({ preco: 0.1, quantidade: 1 }), item({ produto_id: UUID2, preco: 0.2, quantidade: 1 })])).toBe(
      0.3,
    );
  });

  it("carrinho vazio é zero", () => {
    expect(totalCarrinho([])).toBe(0);
  });

  it("quantidadeTotal conta peças, não linhas", () => {
    expect(quantidadeTotal([item({ quantidade: 3 }), item({ produto_id: UUID2, quantidade: 2 })])).toBe(5);
  });
});

/**
 * Estas fronteiras precisam bater com o `check` da migração 0027. Se um número mudar aqui
 * e não lá, o cliente vê "pedido enviado" e o banco recusa.
 */
describe("pedidoVitrineSchema — fronteiras espelhadas no banco", () => {
  const base = {
    slug: "abc123",
    nome: "Ana",
    whatsapp: "(11) 99999-8888",
    observacao: null,
    idempotencia: UUID,
    itens: [{ produto_id: UUID, quantidade: 1 }],
  };

  it("aceita o mínimo válido e normaliza o whatsapp para dígitos", () => {
    const r = validar(pedidoVitrineSchema, base);
    expect(r.whatsapp).toBe("11999998888");
  });

  it("recusa carrinho vazio", () => {
    expect(() => validar(pedidoVitrineSchema, { ...base, itens: [] })).toThrow(/vazio/);
  });

  it(`aceita ${MAX_ITENS} itens e recusa ${MAX_ITENS + 1}`, () => {
    const gerar = (n: number) => Array.from({ length: n }, () => ({ produto_id: UUID, quantidade: 1 }));
    expect(() => validar(pedidoVitrineSchema, { ...base, itens: gerar(MAX_ITENS) })).not.toThrow();
    expect(() => validar(pedidoVitrineSchema, { ...base, itens: gerar(MAX_ITENS + 1) })).toThrow();
  });

  it(`aceita quantidade ${MAX_QTD} e recusa ${MAX_QTD + 1}, 0 e fracionada`, () => {
    const com = (q: number) => ({ ...base, itens: [{ produto_id: UUID, quantidade: q }] });
    expect(() => validar(pedidoVitrineSchema, com(MAX_QTD))).not.toThrow();
    expect(() => validar(pedidoVitrineSchema, com(MAX_QTD + 1))).toThrow();
    expect(() => validar(pedidoVitrineSchema, com(0))).toThrow();
    expect(() => validar(pedidoVitrineSchema, com(1.5))).toThrow();
  });

  it(`recusa nome acima de ${MAX_NOME} e observação acima de ${MAX_OBSERVACAO}`, () => {
    expect(() => validar(pedidoVitrineSchema, { ...base, nome: "a".repeat(MAX_NOME + 1) })).toThrow();
    expect(() => validar(pedidoVitrineSchema, { ...base, observacao: "a".repeat(MAX_OBSERVACAO + 1) })).toThrow();
  });

  it("recusa whatsapp curto demais para ter DDD", () => {
    expect(() => validar(pedidoVitrineSchema, { ...base, whatsapp: "99998888" })).toThrow(/WhatsApp/);
  });

  it("recusa produto_id que não é uuid — a RPC receberia lixo", () => {
    expect(() =>
      validar(pedidoVitrineSchema, { ...base, itens: [{ produto_id: "1 or 1=1", quantidade: 1 }] }),
    ).toThrow();
  });

  it("exige chave de idempotência — sem ela, duplo-toque vira dois pedidos", () => {
    expect(() => validar(pedidoVitrineSchema, { ...base, idempotencia: "nao-e-uuid" })).toThrow();
  });

  // O que NÃO pode estar no schema: preço. Ele é recalculado na RPC.
  it("ignora preço enviado pelo navegador", () => {
    const r = validar(pedidoVitrineSchema, {
      ...base,
      itens: [{ produto_id: UUID, quantidade: 1, preco: 0.01 }],
    });
    expect(r.itens[0]).not.toHaveProperty("preco");
  });
});

describe("textoPedidoVitrine", () => {
  const d = {
    numero: "P-0007",
    nomeCatalogo: "Perfumaria",
    itens: [item({ nome: "Perfume X", preco: 90, quantidade: 2 }), item({ produto_id: UUID2, nome: "Cinto", preco: 45, quantidade: 1 })],
    total: 225,
    nomeCliente: "Ana",
    observacao: null as string | null,
  };

  it("carrega o número do pedido — é o que liga a mensagem ao painel", () => {
    expect(textoPedidoVitrine(d)).toContain("Pedido P-0007");
  });

  // `formatBRL` usa espaço não-quebrável (U+00A0) depois do "R$"; comparar com espaço
  // comum falha por um caractere invisível.
  it("mostra quantidade, nome e subtotal de cada item", () => {
    const t = textoPedidoVitrine(d);
    expect(t).toContain(`2x Perfume X — ${formatBRL(180)}`);
    expect(t).toContain(`1x Cinto — ${formatBRL(45)}`);
  });

  it("omite a observação quando vazia ou só espaço", () => {
    expect(textoPedidoVitrine(d)).not.toContain("Observação");
    expect(textoPedidoVitrine({ ...d, observacao: "   " })).not.toContain("Observação");
    expect(textoPedidoVitrine({ ...d, observacao: "sem cebola" })).toContain("Observação: sem cebola");
  });
});

describe("linkPedidoWhatsapp", () => {
  it("prefixa 55 só quando falta, e aceita número já com DDI", () => {
    expect(linkPedidoWhatsapp("oi", "11 99999-8888")).toContain("wa.me/5511999998888");
    expect(linkPedidoWhatsapp("oi", "5511999998888")).toContain("wa.me/5511999998888");
  });

  it("sem número, usa o formato que deixa a pessoa escolher o contato", () => {
    expect(linkPedidoWhatsapp("oi", null)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it("escapa o texto", () => {
    expect(linkPedidoWhatsapp("a&b c", null)).toContain("a%26b%20c");
  });

  /**
   * O bug que nunca aparece em desenvolvimento com dois itens: o WhatsApp corta link
   * longo demais sem avisar, e o cliente clica e nada acontece.
   */
  it("encurta a lista quando a URL estoura, avisando quantos ficaram de fora", () => {
    const itens = Array.from({ length: 50 }, (_, i) =>
      item({ produto_id: `${i}`, nome: `Produto de nome bem comprido número ${i}`, preco: 99.9, quantidade: 3 }),
    );
    const texto = textoPedidoVitrine({
      numero: "P-0001",
      nomeCatalogo: "Catálogo",
      itens,
      total: 14985,
      nomeCliente: "Ana",
      observacao: null,
    });
    const link = linkPedidoWhatsapp(texto, "11999998888");

    expect(link.length).toBeLessThanOrEqual(MAX_URL_WHATSAPP);
    expect(decodeURIComponent(link)).toContain("item(ns) — lista completa no pedido");
    // O número do pedido tem que sobreviver ao corte: é como o dono acha a lista inteira.
    expect(decodeURIComponent(link)).toContain("P-0001");
  });

  it("carrinho pequeno não é cortado", () => {
    const texto = textoPedidoVitrine({
      numero: "P-0002",
      nomeCatalogo: "Catálogo",
      itens: [item({ nome: "Perfume", preco: 90, quantidade: 1 })],
      total: 90,
      nomeCliente: "Ana",
      observacao: null,
    });
    expect(decodeURIComponent(linkPedidoWhatsapp(texto, null))).not.toContain("lista completa no pedido");
  });
});

describe("textoPedidoVitrine — entrega e link do painel (8.6)", () => {
  const base = { numero: "P-0009", nomeCatalogo: "Loja", itens: [item()], total: 10, nomeCliente: "Ana", observacao: null };
  it("inclui o endereço de entrega quando informado", () => {
    expect(textoPedidoVitrine({ ...base, entrega: "Rua A, 10 - Centro, Recife/PE" })).toContain("Entrega: Rua A, 10 - Centro, Recife/PE");
    expect(textoPedidoVitrine(base)).not.toContain("Entrega:");
  });
  it("termina com o link para o dono confirmar no painel", () => {
    const t = textoPedidoVitrine({ ...base, linkPainel: "https://x.app/vendas?pedido=P-0009" });
    expect(t.split("\n").at(-1)).toBe("Confirmar no painel: https://x.app/vendas?pedido=P-0009");
  });
});
