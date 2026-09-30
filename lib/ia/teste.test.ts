import { describe, expect, it } from "vitest";
import { estadoDoTeste, textoDoTeste, type EstadoTesteBruto } from "./teste";

const base: EstadoTesteBruto = {
  usadas: 0,
  limite: 15,
  dias: 7,
  inicio: null,
  expira_em: null,
  ilimitado: false,
};
const agora = new Date("2026-10-01T15:00:00Z");

describe("estadoDoTeste", () => {
  it("master é ilimitado, qualquer que seja o resto", () => {
    expect(estadoDoTeste({ ...base, ilimitado: true, usadas: 999 }, agora)).toEqual({ situacao: "ilimitado" });
  });

  it("sem nenhum uso ainda: não iniciado, janela conta a partir da primeira geração", () => {
    expect(estadoDoTeste(base, agora)).toEqual({ situacao: "nao_iniciado", limite: 15, dias: 7 });
  });

  it("limite 0 ou 0 dias sem uso: desligado, não 'não iniciado'", () => {
    expect(estadoDoTeste({ ...base, limite: 0 }, agora).situacao).toBe("encerrado");
    expect(estadoDoTeste({ ...base, dias: 0 }, agora).situacao).toBe("encerrado");
  });

  it("dentro do prazo e do limite: ativo com o saldo", () => {
    const e = estadoDoTeste(
      { ...base, usadas: 6, inicio: "2026-09-30T12:00:00Z", expira_em: "2026-10-07T12:00:00Z" },
      agora,
    );
    expect(e).toEqual({ situacao: "ativo", restantes: 9, limite: 15, expiraEm: "2026-10-07T12:00:00Z" });
  });

  it("prazo vencido encerra mesmo com gerações sobrando", () => {
    const e = estadoDoTeste({ ...base, usadas: 2, inicio: "2026-09-01T00:00:00Z", expira_em: "2026-09-08T00:00:00Z" }, agora);
    expect(e).toMatchObject({ situacao: "encerrado", motivo: "prazo" });
  });

  it("limite atingido encerra mesmo dentro do prazo", () => {
    const e = estadoDoTeste({ ...base, usadas: 15, inicio: "2026-09-30T00:00:00Z", expira_em: "2026-10-07T00:00:00Z" }, agora);
    expect(e).toMatchObject({ situacao: "encerrado", motivo: "limite" });
  });

  it("no instante exato do vencimento já está encerrado", () => {
    const e = estadoDoTeste({ ...base, usadas: 1, inicio: "2026-09-24T15:00:00Z", expira_em: "2026-10-01T15:00:00Z" }, agora);
    expect(e).toMatchObject({ situacao: "encerrado", motivo: "prazo" });
  });
});

describe("textoDoTeste", () => {
  it("escreve o saldo e a data de validade", () => {
    const t = textoDoTeste({ situacao: "ativo", restantes: 9, limite: 15, expiraEm: "2026-10-07T12:00:00Z" });
    expect(t).toContain("restam 9 de 15");
    expect(t).toContain("07/10/2026");
  });

  it("cada situação tem um texto próprio", () => {
    expect(textoDoTeste({ situacao: "ilimitado" })).toContain("sem limite");
    expect(textoDoTeste({ situacao: "nao_iniciado", limite: 15, dias: 7 })).toContain("primeira geração");
    expect(textoDoTeste({ situacao: "encerrado", motivo: "limite", limite: 15, expiraEm: null })).toContain("15 gerações");
    expect(textoDoTeste({ situacao: "encerrado", motivo: "prazo", limite: 15, expiraEm: null })).toContain("desligado");
  });
});
