import { describe, expect, it } from "vitest";
import { avaliacaoDaApi, ordenarAvaliacoes } from "./shopee-avaliacoes";

describe("avaliações da Shopee", () => {
  it("converte a resposta da API e ignora linha sem id", () => {
    const a = avaliacaoDaApi({
      comment_id: 9,
      item_id: 3,
      comment: "  Chegou rápido ",
      rating_star: 5,
      create_time: 1_760_000_000,
      comment_reply: { reply: "" },
    });
    expect(a).toEqual({
      commentId: 9,
      itemId: 3,
      comentario: "Chegou rápido",
      estrelas: 5,
      criadaEm: new Date(1_760_000_000_000).toISOString(),
      resposta: null,
    });
    expect(avaliacaoDaApi({ comment: "x" })).toBeNull();
    expect(avaliacaoDaApi({ comment_id: 1, rating_star: 9, comment_reply: { reply: " Obrigado! " } })).toMatchObject({ estrelas: 5, resposta: "Obrigado!" });
  });

  it("sem resposta primeiro, as piores no topo", () => {
    const base = { itemId: 1, comentario: "", criadaEm: "2026-10-01T00:00:00Z" };
    const r = ordenarAvaliacoes([
      { ...base, commentId: 1, estrelas: 5, resposta: null },
      { ...base, commentId: 2, estrelas: 1, resposta: "ok" },
      { ...base, commentId: 3, estrelas: 2, resposta: null },
    ]);
    expect(r.map((x) => x.commentId)).toEqual([3, 1, 2]);
  });
});
