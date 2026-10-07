import { describe, expect, it } from "vitest";
import { avisoAtivacaoTeste } from "./ativacao-teste";

const agora = new Date("2026-10-07T15:00:00Z");
const emDias = (d: number) => new Date(agora.getTime() + d * 86_400_000).toISOString();
const teste = (diasRestantes: number) => ({ status: "teste" as const, teste_ate: emDias(diasRestantes), plano_id: "pro", plano_efetivo: "pro" });
const nada = { temProduto: false, temVenda: false };

describe("avisoAtivacaoTeste", () => {
  it("dia 1 sem produto: cadastre o primeiro produto", () => {
    const a = avisoAtivacaoTeste(teste(13.9), nada, agora);
    expect(a?.tipo).toBe("produto");
    expect(a?.texto).toContain("Dia 1");
    expect(a?.href).toBe("/produtos");
  });

  it("dia 3 sem produto ainda pede produto; dia 4 passa a pedir venda", () => {
    expect(avisoAtivacaoTeste(teste(11.5), nada, agora)?.tipo).toBe("produto");
    const d4 = avisoAtivacaoTeste(teste(10.5), nada, agora);
    expect(d4?.tipo).toBe("venda");
    expect(d4?.texto).toContain("Dia 4");
  });

  it("com produto e sem venda: registre a primeira venda", () => {
    const a = avisoAtivacaoTeste(teste(13), { temProduto: true, temVenda: false }, agora);
    expect(a?.tipo).toBe("venda");
    expect(a?.href).toBe("/pdv");
  });

  it("com produto e venda, no meio do teste: nada a dizer", () => {
    expect(avisoAtivacaoTeste(teste(8), { temProduto: true, temVenda: true }, agora)).toBeNull();
  });

  it("faltando 3 dias ou menos, o fim do teste vem antes de tudo", () => {
    const a = avisoAtivacaoTeste(teste(2.5), nada, agora);
    expect(a?.tipo).toBe("fim");
    expect(a?.texto).toBe("Seu teste grátis acaba em 3 dias.");
    expect(a?.href).toBe("/configuracoes?aba=plano");
    expect(a?.tom).toBe("negative");
    expect(avisoAtivacaoTeste(teste(0.4), { temProduto: true, temVenda: true }, agora)?.texto).toBe("Seu teste grátis acaba hoje.");
  });

  it("fora do teste, teste vencido ou sem assinatura: nada", () => {
    expect(avisoAtivacaoTeste(null, nada, agora)).toBeNull();
    expect(avisoAtivacaoTeste({ ...teste(10), status: "ativa" }, nada, agora)).toBeNull();
    expect(avisoAtivacaoTeste(teste(-1), nada, agora)).toBeNull();
    expect(avisoAtivacaoTeste({ ...teste(5), plano_efetivo: "gratis" }, nada, agora)).toBeNull();
    expect(avisoAtivacaoTeste({ ...teste(5), teste_ate: null }, nada, agora)).toBeNull();
    expect(avisoAtivacaoTeste({ ...teste(5), teste_ate: "lixo" }, nada, agora)).toBeNull();
  });

  it("teste estendido além de 14 dias conta como dia 1", () => {
    expect(avisoAtivacaoTeste(teste(30), nada, agora)?.texto).toContain("Dia 1");
  });
});
