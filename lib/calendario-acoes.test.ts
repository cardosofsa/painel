import { describe, expect, it } from "vitest";
import { acoesDaData } from "./calendario-acoes";

describe("ações do calendário", () => {
  it("antes da hora de preparar, nada", () => {
    expect(acoesDaData({ id: "natal-2026", preparar: false })).toEqual([]);
  });

  it("campanha de marketplace começa pela promoção", () => {
    const a = acoesDaData({ id: "11-11-2026", preparar: true });
    expect(a[0]).toEqual({ rotulo: "Simular promoção", href: "/precificacao?visao=promocao" });
    expect(acoesDaData({ id: "black-friday-2026", preparar: true })[0].rotulo).toBe("Simular promoção");
  });

  it("data de presente começa pela mensagem e sugere kit", () => {
    const a = acoesDaData({ id: "maes-2027", preparar: true }).map((x) => x.rotulo);
    expect(a).toEqual(["Avisar clientes", "Montar kit", "Repor o que vende"]);
  });

  it("outras datas: repor e avisar", () => {
    expect(acoesDaData({ id: "volta-aulas-2027", preparar: true }).map((x) => x.href)).toEqual(["/compras", "/vixe/mensagens?filtro=data"]);
  });
});
