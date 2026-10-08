import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trava das dependências pesadas do cliente. Cada uma delas já entrou estática no
 * JavaScript inicial de telas inteiras, e o TypeScript não reclama de nada disso:
 *
 * - `recharts`: só os arquivos de `components/charts/` importam; as telas usam os
 *   gráficos de `components/charts/dinamicos.tsx` (`next/dynamic`, carregado sob demanda);
 * - `html-to-image`: só por `import()` na hora de gerar a imagem (`PreviaImagem.tsx`);
 * - `exceljs`, `jspdf` e `jspdf-autotable`: só por `import()` dentro da função que exporta/importa
 *   (centenas de KB que ninguém precisa até clicar em Exportar);
 * - `simple-icons`: em lugar nenhum; os desenhos usados moram em `lib/marcas-desenhos.ts`.
 *
 * `import type` passa: é apagado na compilação e não leva código ao navegador.
 */

const RAIZ = path.resolve(__dirname, "..");
const PASTAS = ["app", "components", "lib", "proxy.ts"];
const PASTA_GRAFICOS = path.join("components", "charts") + path.sep;

function arquivos(alvo: string): string[] {
  const abs = path.join(RAIZ, alvo);
  if (/\.(ts|tsx|mjs|js)$/.test(alvo)) return [alvo];
  let entradas;
  try {
    entradas = readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  return entradas.flatMap((e) => {
    const rel = path.join(alvo, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : arquivos(rel);
    return /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

/** Módulos importados estaticamente (import/export ... from), sem os `import type`. */
function importacoesEstaticas(codigo: string): string[] {
  const re = /^\s*(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  return [...codigo.matchAll(re)].map((m) => m[1] ?? m[2]);
}

const fontes = PASTAS.flatMap(arquivos).map((rel) => ({ rel, codigo: readFileSync(path.join(RAIZ, rel), "utf8") }));

describe("dependências pesadas fora do JavaScript inicial", () => {
  it("varre os fontes de verdade", () => {
    expect(fontes.length).toBeGreaterThan(50);
    expect(fontes.some((f) => f.rel.endsWith(path.join("charts", "dinamicos.tsx")))).toBe(true);
  });

  it("recharts só dentro de components/charts", () => {
    const fora = fontes.filter((f) => !f.rel.startsWith(PASTA_GRAFICOS) && importacoesEstaticas(f.codigo).some((m) => m === "recharts" || m.startsWith("recharts/")));
    expect(fora.map((f) => f.rel)).toEqual([]);
  });

  it("telas usam os gráficos de components/charts/dinamicos, não o arquivo do gráfico", () => {
    const direto = /^@\/components\/charts\/(?!dinamicos$|tema$)/;
    const fora = fontes.filter((f) => !f.rel.startsWith(PASTA_GRAFICOS) && importacoesEstaticas(f.codigo).some((m) => direto.test(m)));
    expect(fora.map((f) => f.rel)).toEqual([]);
  });

  it("html-to-image nunca estático", () => {
    const estatico = fontes.filter((f) => importacoesEstaticas(f.codigo).includes("html-to-image"));
    expect(estatico.map((f) => f.rel)).toEqual([]);
  });

  it("exceljs e jspdf nunca estáticos", () => {
    const pesados = ["exceljs", "jspdf", "jspdf-autotable"];
    const estatico = fontes.filter((f) => importacoesEstaticas(f.codigo).some((m) => pesados.includes(m)));
    expect(estatico.map((f) => f.rel)).toEqual([]);
  });

  it("simple-icons em lugar nenhum", () => {
    const usa = fontes.filter((f) => /["']simple-icons(?:\/[^"']*)?["']/.test(f.codigo));
    expect(usa.map((f) => f.rel)).toEqual([]);
  });

  it("o detector pega import estático e deixa passar import type e import()", () => {
    expect(importacoesEstaticas('import { A } from "recharts";')).toEqual(["recharts"]);
    expect(importacoesEstaticas('import {\n  A,\n  B,\n} from "recharts";')).toEqual(["recharts"]);
    expect(importacoesEstaticas('export { A } from "./x";')).toEqual(["./x"]);
    expect(importacoesEstaticas('import "./estilo.css";')).toEqual(["./estilo.css"]);
    expect(importacoesEstaticas('import type { A } from "recharts";')).toEqual([]);
    expect(importacoesEstaticas('const m = await import("html-to-image");')).toEqual([]);
  });
});
