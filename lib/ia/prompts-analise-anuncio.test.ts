import { TERMOS_VAZIOS } from "@/lib/conformidade/termos";
import { describe, expect, it } from "vitest";
import { hashContextoAnalise, interpretarAnalise, interpretarCapa, montarPromptAnalise, type ContextoAnaliseIA } from "./prompts-analise-anuncio";

const ctx: ContextoAnaliseIA = {
  titulo: "Caneca de Cerâmica 325 ml",
  plataforma: "Shopee",
  limite: 60,
  nota: 50,
  criteriosFalhos: ["Curto"],
  palavrasAusentes: ["presente"],
  imagens: { total: 3, recomendado: 8 },
  vendas: { unidades30: 10, pedidos30: 9, unidades90: 30, tendencia: "estável", veredito: "Dentro do esperado" },
  preco: { atual: 59.9, ideal: 62, minimo: 40, lucro: 10, margemPct: 16.7, zonaMorta: false },
  estoqueDias: 30,
};

describe("prompt da análise", () => {
  it("leva só os números calculados e o limite do título", () => {
    const p = montarPromptAnalise(ctx);
    expect(p).toContain("até 60 caracteres");
    expect(p).toContain("R$ 59,90");
    expect(p).toContain("presente");
  });

  it("descarta título longo, com termo barrado ou repetido; normaliza a estratégia", () => {
    const bruto = JSON.stringify({
      diagnostico: "Bom anúncio.",
      titulos: ["Caneca de Cerâmica Presente 325 ml Café", "Caneca chame no WhatsApp para pedir já", "x".repeat(80), "caneca de cerâmica presente 325 ml café", "Caneca que cura dor de cabeça e insônia"],
      estrategia: [{ aba: "preco", acao: "Subir até o ideal", motivo: "Margem de 16,7%" }, { aba: "qualquer", acao: "Repor estoque", motivo: "" }, { aba: "titulo", acao: "", motivo: "x" }],
    });
    const r = interpretarAnalise(bruto, 60, { ...TERMOS_VAZIOS, revisar: ["cura"] });
    expect(r.titulos).toEqual(["Caneca de Cerâmica Presente 325 ml Café"]);
    expect(r.estrategia).toEqual([
      { aba: "preco", acao: "Subir até o ideal", motivo: "Margem de 16,7%" },
      { aba: "estrategia", acao: "Repor estoque", motivo: "" },
    ]);
  });

  it("resposta quebrada vira vazio sem lançar; cache ignora poeira", () => {
    expect(interpretarAnalise("não é json", 60, null)).toEqual({ diagnostico: "", titulos: [], estrategia: [] });
    const outro = { ...ctx, preco: { ...ctx.preco!, atual: 59.9004 } };
    expect(hashContextoAnalise(outro)).toBe(hashContextoAnalise(ctx));
  });
});

describe("capa", () => {
  it("um ponto por aspecto, na ordem, sem aspecto inventado", () => {
    const r = interpretarCapa(JSON.stringify({ resumo: "Ok", pontos: [{ aspecto: "texto", ok: false, comentario: "Muito texto" }, { aspecto: "produto", ok: true, comentario: "Bom" }, { aspecto: "brilho", ok: true, comentario: "x" }, { aspecto: "produto", ok: false, comentario: "dup" }] }));
    expect(r.pontos.map((p) => p.aspecto)).toEqual(["produto", "texto"]);
    expect(r.pontos[1].ok).toBe(false);
  });
});
