import { describe, expect, it } from "vitest";
import {
  enderecoEmLinha,
  garantiaTexto,
  itensComGarantia,
  linkComprovanteWhatsapp,
  textoComprovante,
  type DadosComprovante,
} from "./comprovante";

const base: DadosComprovante = {
  numero: "V-0001",
  itens: [{ nome: "Caneca", quantidade: 2, preco_unitario: 19.9 }],
  subtotal: 39.8,
  desconto: 0,
  valorEntrega: 0,
  total: 39.8,
  formaPagamento: "Pix",
  clienteNome: "Mateus",
};

describe("enderecoEmLinha", () => {
  it("monta a linha completa", () => {
    expect(
      enderecoEmLinha({ endereco: "Rua A", numero: "12", complemento: "apto 3", bairro: "Centro", cidade: "Salvador", uf: "BA", cep: "40000-000" }),
    ).toBe("Rua A, 12 — apto 3 · Centro · Salvador/BA · CEP 40000-000");
  });

  it("não deixa separador solto quando falta parte", () => {
    expect(enderecoEmLinha({ endereco: "Rua A", cidade: "Salvador", uf: "BA" })).toBe("Rua A · Salvador/BA");
    expect(enderecoEmLinha({ cidade: "Salvador" })).toBe("Salvador");
  });

  it("devolve null sem nada", () => {
    expect(enderecoEmLinha({})).toBeNull();
    expect(enderecoEmLinha({ endereco: "  ", numero: null })).toBeNull();
  });
});

describe("garantiaTexto", () => {
  it("usa dias, e anos só quando fecha exato", () => {
    expect(garantiaTexto(1)).toBe("1 dia");
    expect(garantiaTexto(90)).toBe("90 dias");
    expect(garantiaTexto(365)).toBe("1 ano");
    expect(garantiaTexto(730)).toBe("2 anos");
    expect(garantiaTexto(400)).toBe("400 dias");
  });
});

describe("itensComGarantia", () => {
  it("ignora null, zero e ausente", () => {
    const itens = [
      { nome: "A", quantidade: 1, preco_unitario: 1, garantia_dias: 30 },
      { nome: "B", quantidade: 1, preco_unitario: 1, garantia_dias: null },
      { nome: "C", quantidade: 1, preco_unitario: 1, garantia_dias: 0 },
      { nome: "D", quantidade: 1, preco_unitario: 1 },
    ];
    expect(itensComGarantia(itens).map((i) => i.nome)).toEqual(["A"]);
  });
});

describe("textoComprovante", () => {
  it("sem garantia nem parcelas, mantém o formato de sempre", () => {
    const t = textoComprovante(base);
    expect(t).toContain("Comprovante — Venda V-0001");
    expect(t).toContain("Pagamento: Pix");
    expect(t).toContain("Cliente: Mateus");
    expect(t).not.toContain("Garantia");
    expect(t).not.toContain("Parcelas");
  });

  it("só mostra o bloco Garantia quando há item com garantia", () => {
    const t = textoComprovante({ ...base, itens: [{ ...base.itens[0], garantia_dias: 90 }] });
    expect(t).toContain("Garantia:");
    expect(t).toContain("- Caneca: 90 dias");
  });

  it("inclui taxa de maquineta e parcelas quando existirem", () => {
    const t = textoComprovante({
      ...base,
      pagamento: { entradaValor: 0, entradaForma: null, formaPagamento2: null, parcelasCartao: 3, taxaMaquinetaPct: 4, taxaMaquinetaValor: 1.59 },
      parcelas: [{ numero: 1, totalParcelas: 2, valor: 20, status: "atrasada", dataVencimento: "2026-01-15" }],
    });
    expect(t).toContain("Taxa de maquineta: R$");
    expect(t).toContain("1/2");
    expect(t).toContain("(atrasada)");
  });
});

describe("linkComprovanteWhatsapp", () => {
  it("prefixa 55 quando o número não tem", () => {
    expect(linkComprovanteWhatsapp(base, "(75) 99255-2305")).toMatch(/^https:\/\/wa\.me\/5575992552305\?text=/);
  });
  it("sem número, abre o seletor de contato", () => {
    expect(linkComprovanteWhatsapp(base, null)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
