import { describe, expect, it } from "vitest";
import { bateComFontes, empacotarPesquisa, extrairResposta, hashConcorrentes, interpretarConcorrentes, montarPromptConcorrentes, pesquisaVazia } from "./prompts-concorrentes";

const ctx = { produtoNome: "Bolsa tiracolo de couro", plataforma: "Shopee", nicho: null };

describe("montarPromptConcorrentes", () => {
  it("pede só o que foi encontrado e proíbe inventar", () => {
    const p = montarPromptConcorrentes(ctx);
    expect(p).toContain("Bolsa tiracolo de couro");
    expect(p).toContain("Shopee");
    expect(p).toContain("Não invente título, preço, diferencial nem endereço");
    expect(p).toContain("SOMENTE com um objeto JSON");
  });
});

describe("extrairResposta", () => {
  const api = {
    candidates: [
      {
        content: { parts: [{ text: '{"concorrentes":[' }, { text: "]}" }] },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: "https://redir.example/abc", title: "lojaexemplo.com.br" } }, { web: { uri: "javascript:x", title: "ruim" } }, { web: { uri: "https://redir.example/abc", title: "repetida" } }],
        },
      },
    ],
  };
  it("junta o texto e as fontes válidas, sem repetir", () => {
    const r = extrairResposta(api);
    expect(r.texto).toBe('{"concorrentes":[]}');
    expect(r.fontes).toEqual([{ url: "https://redir.example/abc", titulo: "lojaexemplo.com.br" }]);
  });
  it("resposta sem candidatos vira vazio, sem lançar", () => {
    expect(extrairResposta({})).toEqual({ texto: "", fontes: [] });
    expect(extrairResposta(null)).toEqual({ texto: "", fontes: [] });
  });
});

describe("interpretarConcorrentes", () => {
  const fontes = [{ url: "https://redir.example/abc", titulo: "lojaexemplo.com.br" }];
  const dados = {
    concorrentes: [
      { titulo: "Bolsa Feminina Couro Legítimo", preco_texto: "R$ 89,90", diferenciais: ["Couro legítimo", "Alça regulável"], url: "https://www.lojaexemplo.com.br/p/1" },
      { titulo: "Sem link", preco_texto: "R$ 10", diferenciais: [], url: "" },
      { titulo: "Link ruim", preco_texto: "", diferenciais: [], url: "javascript:alert(1)" },
      { titulo: "Preço não numérico", preco_texto: "consulte", diferenciais: [], url: "https://outro.com/p/2" },
      { titulo: "Repetido", preco_texto: "", diferenciais: [], url: "https://outro.com/p/2" },
    ],
    observacao: "Poucos resultados.",
  };
  const r = interpretarConcorrentes(empacotarPesquisa(JSON.stringify(dados), fontes));

  it("só entra concorrente com título e link http(s); repetido sai", () => {
    expect(r.concorrentes.map((c) => c.titulo)).toEqual(["Bolsa Feminina Couro Legítimo", "Preço não numérico"]);
  });
  it("marca como confirmado o que bate com uma fonte consultada", () => {
    expect(r.concorrentes[0].confirmado).toBe(true);
    expect(r.concorrentes[1].confirmado).toBe(false);
  });
  it("preço só vale se tem número", () => {
    expect(r.concorrentes[0].precoTexto).toBe("R$ 89,90");
    expect(r.concorrentes[1].precoTexto).toBeNull();
  });
  it("guarda observação e fontes", () => {
    expect(r.observacao).toBe("Poucos resultados.");
    expect(r.fontes).toEqual(fontes);
  });
  it("lixo vira pesquisa vazia, sem lançar", () => {
    expect(pesquisaVazia(interpretarConcorrentes("não é json"))).toBe(true);
    expect(pesquisaVazia(interpretarConcorrentes(empacotarPesquisa("texto solto sem json", [])))).toBe(true);
    expect(pesquisaVazia(r)).toBe(false);
  });
  it("lista vazia COM explicação é um resultado válido ('não achei')", () => {
    const vazio = interpretarConcorrentes(empacotarPesquisa('{"concorrentes":[],"observacao":"Nada confiável."}', []));
    expect(vazio.concorrentes).toEqual([]);
    expect(pesquisaVazia(vazio)).toBe(false);
  });
});

describe("bateComFontes", () => {
  it("compara pelo endereço, pelo título e pelo domínio", () => {
    const f = [{ url: "https://redir.example/abc", titulo: "mercadolivre.com.br" }];
    expect(bateComFontes("https://redir.example/abc", f)).toBe(true);
    expect(bateComFontes("https://www.mercadolivre.com.br/x", f)).toBe(true);
    expect(bateComFontes("https://outro.com/x", f)).toBe(false);
    expect(bateComFontes("não é url", f)).toBe(false);
  });
});

describe("hashConcorrentes", () => {
  it("ignora caixa e espaços do nome e muda com a plataforma", () => {
    expect(hashConcorrentes(ctx)).toBe(hashConcorrentes({ ...ctx, produtoNome: "  BOLSA TIRACOLO DE COURO " }));
    expect(hashConcorrentes({ ...ctx, plataforma: "Amazon" })).not.toBe(hashConcorrentes(ctx));
  });
});
