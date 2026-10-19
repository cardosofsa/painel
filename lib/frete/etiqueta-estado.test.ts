import { describe, expect, it } from "vitest";
import { estadoEtiqueta, marcaPendente, marcaReserva, podeReservar, RESERVA_EXPIRA_MS } from "./etiqueta-estado";

describe("estado da etiqueta", () => {
  const agora = new Date("2026-10-19T12:00:00Z");
  it("lê os quatro estados", () => {
    expect(estadoEtiqueta(null)).toEqual({ tipo: "nenhuma" });
    expect(estadoEtiqueta(marcaReserva(agora))).toEqual({ tipo: "reservando", desde: agora });
    expect(estadoEtiqueta(marcaPendente("abc"))).toEqual({ tipo: "pendente", id: "abc" });
    expect(estadoEtiqueta("abc")).toEqual({ tipo: "comprada", id: "abc" });
  });
  it("só reserva sem etiqueta ou com reserva abandonada", () => {
    expect(podeReservar(estadoEtiqueta(null), agora)).toBe(true);
    expect(podeReservar(estadoEtiqueta(marcaReserva(new Date(agora.getTime() - 1000))), agora)).toBe(false);
    expect(podeReservar(estadoEtiqueta(marcaReserva(new Date(agora.getTime() - RESERVA_EXPIRA_MS - 1))), agora)).toBe(true);
    expect(podeReservar(estadoEtiqueta("reservando:lixo"), agora)).toBe(true);
    expect(podeReservar(estadoEtiqueta(marcaPendente("x")), agora)).toBe(false);
    expect(podeReservar(estadoEtiqueta("x"), agora)).toBe(false);
  });
});
