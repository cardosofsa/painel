import { describe, expect, it } from "vitest";
import {
  hashFerramenta,
  interpretarAtributos,
  interpretarTexto,
  montarPromptAtributos,
  montarPromptCobranca,
  montarPromptLegenda,
  montarPromptResposta,
  preencherNome,
} from "./prompts-textos";

const produto = { nome: "Óleo para Barba", descricao: "Frasco de 30 ml, aroma amadeirado.", preco: 39.9, garantiaDias: null, emEstoque: true };

describe("prompts das ferramentas", () => {
  it("resposta leva a pergunta e manda não chutar", () => {
    const p = montarPromptResposta({ produto, pergunta: "Serve para pele sensível?" });
    expect(p).toContain("Serve para pele sensível?");
    expect(p).toContain("Não chute");
    expect(p).toContain("R$");
    expect(p).not.toContain("Garantia");
  });

  it("avaliação da Shopee: elogio agradece; nota baixa pede desculpas sem prometer troca", () => {
    const boa = montarPromptResposta({ produto, pergunta: "Amei, chegou rápido", estrelas: 5 });
    expect(boa).toContain("5 de 5 estrelas");
    expect(boa).toContain("Agradeça de forma calorosa");
    const ruim = montarPromptResposta({ produto, pergunta: "Veio quebrado", estrelas: 2 });
    expect(ruim).toContain("peça desculpas");
    expect(ruim).toContain("Não admita defeito nem prometa troca");
    expect(ruim).not.toContain("Não chute");
  });

  it("cobrança nunca ameaça e muda com o tom", () => {
    const base = { parcelas: [{ valor: 50, vencimento: "10/09/2026", atrasoDias: 20 }] };
    const g = montarPromptCobranca({ ...base, tom: "gentil" });
    expect(g).toContain("Nunca ameace");
    expect(g).toContain("Tom gentil");
    expect(g).toContain("20 dias de atraso");
    expect(montarPromptCobranca({ ...base, tom: "firme" })).toContain("Tom firme");
  });

  it("cobrança não leva nome de cliente; o nome entra depois, no navegador", () => {
    const p = montarPromptCobranca({ parcelas: [{ valor: 50, vencimento: "10/09/2026", atrasoDias: 2 }], tom: "gentil" });
    expect(p).toContain("[NOME]");
    expect(preencherNome("Oi, [NOME]! Tudo certo?", "Maria Souza")).toBe("Oi, Maria! Tudo certo?");
    expect(preencherNome("Oi, [NOME]! Tudo certo?", null)).toBe("Oi! Tudo certo?");
  });

  it("legenda: Instagram pede hashtags, WhatsApp não; link entra quando existe", () => {
    expect(montarPromptLegenda({ produto, rede: "instagram" })).toContain("hashtags em português");
    const w = montarPromptLegenda({ produto, rede: "whatsapp", linkVitrine: "https://x.app/vitrine/loja" });
    expect(w).toContain("Deixe hashtags vazio");
    expect(w).toContain("terminando com o link");
  });

  it("ficha técnica só com o que está escrito", () => {
    expect(montarPromptAtributos({ produto })).toContain("Só o que está ESCRITO");
  });
});

describe("leitura", () => {
  it("texto com hashtags normalizadas e sem repetir", () => {
    const r = interpretarTexto(JSON.stringify({ texto: "Oi", hashtags: ["#Barba", "barba", "#óleo natural", 3] }), 100);
    expect(r).toEqual({ texto: "Oi", hashtags: ["barba", "óleonatural"] });
  });

  it("texto cru vira o texto; limite respeitado", () => {
    expect(interpretarTexto("resposta direta", 100).texto).toBe("resposta direta");
    expect(interpretarTexto(JSON.stringify({ texto: "palavra ".repeat(50) }), 60).texto.length).toBeLessThanOrEqual(60);
  });

  it("atributos inválidos somem", () => {
    const r = interpretarAtributos(JSON.stringify({ atributos: [{ nome: "Volume", valor: "30 ml" }, { nome: "", valor: "x" }, "lixo"] }));
    expect(r).toEqual([{ nome: "Volume", valor: "30 ml" }]);
    expect(interpretarAtributos("nada")).toEqual([]);
  });

  it("hash muda por ferramenta e por contexto", () => {
    expect(hashFerramenta("resposta", { a: 1 })).not.toBe(hashFerramenta("legenda", { a: 1 }));
    expect(hashFerramenta("resposta", { a: 1 })).not.toBe(hashFerramenta("resposta", { a: 2 }));
  });
});
