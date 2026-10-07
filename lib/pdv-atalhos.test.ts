import { describe, expect, it } from "vitest";
import { acaoDoAtalho, ehCampoEditavel, valorEmPix } from "./pdv-atalhos";

describe("acaoDoAtalho", () => {
  it("mapeia as F-keys mesmo com foco num campo", () => {
    expect(acaoDoAtalho({ key: "F2", emCampo: true })).toBe("buscar");
    expect(acaoDoAtalho({ key: "F4", emCampo: true })).toBe("cobrar");
    expect(acaoDoAtalho({ key: "F8", emCampo: true })).toBe("desconto");
  });

  it("F4 com o checkout aberto finaliza; F2/F8 não fazem nada lá", () => {
    expect(acaoDoAtalho({ key: "F4", checkoutAberto: true })).toBe("finalizar");
    expect(acaoDoAtalho({ key: "F2", checkoutAberto: true })).toBeNull();
    expect(acaoDoAtalho({ key: "F8", checkoutAberto: true })).toBeNull();
  });

  it("outro modal aberto desliga os atalhos", () => {
    expect(acaoDoAtalho({ key: "F4", outroModalAberto: true })).toBeNull();
    expect(acaoDoAtalho({ key: "+", outroModalAberto: true })).toBeNull();
  });

  it("+ e − alteram a quantidade só fora de campo", () => {
    expect(acaoDoAtalho({ key: "+" })).toBe("mais");
    expect(acaoDoAtalho({ key: "-" })).toBe("menos");
    expect(acaoDoAtalho({ key: "Subtract" })).toBe("menos");
    expect(acaoDoAtalho({ key: "+", emCampo: true })).toBeNull();
    expect(acaoDoAtalho({ key: "-", emCampo: true })).toBeNull();
  });

  it("Esc limpa fora de campo", () => {
    expect(acaoDoAtalho({ key: "Escape" })).toBe("limpar");
    expect(acaoDoAtalho({ key: "Escape", emCampo: true })).toBeNull();
    expect(acaoDoAtalho({ key: "Escape", checkoutAberto: true })).toBeNull();
  });

  it("modificadores e teclas comuns não são atalho", () => {
    expect(acaoDoAtalho({ key: "F4", alt: true })).toBeNull();
    expect(acaoDoAtalho({ key: "F2", ctrl: true })).toBeNull();
    expect(acaoDoAtalho({ key: "+", meta: true })).toBeNull();
    expect(acaoDoAtalho({ key: "a" })).toBeNull();
    expect(acaoDoAtalho({ key: "Enter" })).toBeNull();
  });
});

describe("ehCampoEditavel", () => {
  it("reconhece campos de texto", () => {
    expect(ehCampoEditavel({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(ehCampoEditavel({ tagName: "input", type: "number" })).toBe(true);
    expect(ehCampoEditavel({ tagName: "INPUT" })).toBe(true);
    expect(ehCampoEditavel({ tagName: "TEXTAREA" })).toBe(true);
    expect(ehCampoEditavel({ tagName: "SELECT" })).toBe(true);
    expect(ehCampoEditavel({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("botões e caixas de marcar não contam", () => {
    expect(ehCampoEditavel({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(ehCampoEditavel({ tagName: "BUTTON" })).toBe(false);
    expect(ehCampoEditavel({ tagName: "BODY" })).toBe(false);
    expect(ehCampoEditavel(null)).toBe(false);
  });
});

describe("valorEmPix", () => {
  it("forma principal Pix: o total", () => {
    expect(valorEmPix({ total: 100, entradaValor: 0, entradaPix: false, formaPrincipalPix: true })).toBe(100);
  });
  it("entrada em Pix + restante no cartão: só a entrada", () => {
    expect(valorEmPix({ total: 100, entradaValor: 30, entradaPix: true, formaPrincipalPix: false })).toBe(30);
  });
  it("entrada em dinheiro + restante em Pix: só o restante", () => {
    expect(valorEmPix({ total: 100, entradaValor: 30.1, entradaPix: false, formaPrincipalPix: true })).toBe(69.9);
  });
  it("os dois em Pix: o total", () => {
    expect(valorEmPix({ total: 100, entradaValor: 30, entradaPix: true, formaPrincipalPix: true })).toBe(100);
  });
  it("nada em Pix e entrada maior que o total", () => {
    expect(valorEmPix({ total: 100, entradaValor: 0, entradaPix: false, formaPrincipalPix: false })).toBe(0);
    expect(valorEmPix({ total: 50, entradaValor: 80, entradaPix: true, formaPrincipalPix: true })).toBe(50);
  });
});
