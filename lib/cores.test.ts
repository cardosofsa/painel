import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { contraste, luminancia, tokensDoBloco } from "./cores";

/**
 * Este teste lê `app/globals.css` de verdade, não uma cópia dos valores.
 *
 * Existe porque `--text-tertiary` passou muito tempo em #a1a1aa, que dá **2,56:1** sobre
 * branco — reprovado no WCAG AA até para texto grande — enquanto pintava cabeçalho de
 * tabela, eyebrow de card e todos os estados vazios, em cerca de 230 lugares. Ninguém
 * percebeu porque contraste ruim não quebra nada: só fica difícil de ler.
 *
 * Trocar um token por um valor ilegível agora falha aqui.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const claro = tokensDoBloco(css, ":root");
const escuro = { ...claro, ...tokensDoBloco(css, ':root[data-theme="dark"]') };

const AA_TEXTO = 4.5;
const AA_GRANDE = 3;

describe("contraste (função)", () => {
  it("preto sobre branco é 21:1", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("cor igual a si mesma é 1:1", () => {
    expect(contraste("#3b4d1f", "#3b4d1f")).toBeCloseTo(1, 5);
  });

  it("é simétrica — a ordem dos argumentos não importa", () => {
    expect(contraste("#ffffff", "#71717a")).toBeCloseTo(contraste("#71717a", "#ffffff"), 10);
  });

  it("branco tem luminância 1 e preto 0", () => {
    expect(luminancia("#ffffff")).toBeCloseTo(1, 5);
    expect(luminancia("#000000")).toBeCloseTo(0, 5);
  });
});

describe("tokensDoBloco", () => {
  it("lê o :root e separa do tema escuro", () => {
    expect(claro["--text-primary"]).toBe("#18181b");
    expect(escuro["--text-primary"]).toBe("#f4f4f5");
  });
});

for (const [tema, t] of [
  ["claro", claro],
  ["escuro", escuro],
] as const) {
  describe(`tokens — tema ${tema}`, () => {
    const superficies = ["--surface-1", "--surface-2", "--background"] as const;

    for (const fundo of superficies) {
      // `text-tertiary` é o caso que motivou o teste: ele NÃO é decorativo, pinta
      // cabeçalho de tabela e estado vazio, então precisa passar como texto normal.
      for (const texto of ["--text-primary", "--text-secondary", "--text-tertiary"] as const) {
        it(`${texto} sobre ${fundo} passa AA (${AA_TEXTO}:1)`, () => {
          expect(contraste(t[texto], t[fundo])).toBeGreaterThanOrEqual(AA_TEXTO);
        });
      }

      it(`--accent sobre ${fundo} passa AA`, () => {
        expect(contraste(t["--accent"], t[fundo])).toBeGreaterThanOrEqual(AA_TEXTO);
      });
    }

    it("a rampa de cinza tem três degraus distinguíveis, não dois tons parecidos", () => {
      const p = luminancia(t["--text-primary"]);
      const s = luminancia(t["--text-secondary"]);
      const ter = luminancia(t["--text-tertiary"]);
      const ordenado = tema === "claro" ? p < s && s < ter : p > s && s > ter;
      expect(ordenado).toBe(true);
      // Degrau perceptível entre secondary e tertiary — se ficarem próximos, a hierarquia
      // some e a tela vira uma parede de cinza só.
      expect(contraste(t["--text-secondary"], t["--text-tertiary"])).toBeGreaterThanOrEqual(1.3);
    });

    it("texto sobre o accent (botão primário) é legível", () => {
      expect(contraste(t["--accent-on"], t["--accent"])).toBeGreaterThanOrEqual(AA_TEXTO);
    });

    it("positivo e negativo passam sobre o card — são o resultado financeiro", () => {
      expect(contraste(t["--positive"], t["--surface-1"])).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(contraste(t["--negative"], t["--surface-1"])).toBeGreaterThanOrEqual(AA_GRANDE);
    });

    it("a borda se distingue da superfície que ela contorna", () => {
      // Eram o mesmo valor (#e4e4e7 para os dois), então o contorno do card
      // praticamente não existia.
      expect(t["--border"]).not.toBe(t["--surface-3"]);
      expect(contraste(t["--border"], t["--surface-1"])).toBeGreaterThan(1.1);
    });

    it("chip de status lê sobre o próprio fundo suave", () => {
      expect(contraste(t["--positive"], t["--positive-soft"])).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(contraste(t["--negative"], t["--negative-soft"])).toBeGreaterThanOrEqual(AA_GRANDE);
      expect(contraste(t["--accent"], t["--accent-soft"])).toBeGreaterThanOrEqual(AA_GRANDE);
    });
  });
}

describe("movimento", () => {
  it("existe token de duração e de curva — antes havia 150ms, 180ms e 200ms soltos", () => {
    expect(claro["--duracao-rapida"]).toBeDefined();
    expect(claro["--duracao-media"]).toBeDefined();
    expect(claro["--curva"]).toBeDefined();
  });

  it("prefers-reduced-motion cobre tudo, não só o tab-fade", () => {
    const bloco = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).toContain("*,");
    expect(bloco).toContain("animation-duration");
    expect(bloco).toContain("transition-duration");
  });
});

describe("elevação", () => {
  it("cada tema define os três níveis de sombra", () => {
    for (const n of ["--sombra-1", "--sombra-2", "--sombra-3"]) {
      expect(claro[n]).toBeDefined();
      expect(escuro[n]).toBeDefined();
    }
  });

  it("no escuro a elevação não é só sombra preta — ela some no fundo preto", () => {
    expect(escuro["--sombra-2"]).toContain("inset");
  });
});
