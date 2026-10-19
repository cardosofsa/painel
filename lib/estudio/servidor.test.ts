import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capaEmGeracao, ERRO_CONCORRENCIA, gravarEstadoVersionado } from "./servidor";

/** Uma linha de `anuncio_rascunhos` com o UPDATE condicional do PostgREST (`eq` em cada filtro). */
function bancoFalso(linha: { id: string; atualizado_em: string; estado: unknown }) {
  return {
    linha,
    from() {
      return {
        update(valores: Record<string, unknown>) {
          const filtros: [string, unknown][] = [];
          const consulta = {
            eq(col: string, val: unknown) {
              filtros.push([col, val]);
              return consulta;
            },
            async select() {
              const bate = filtros.every(([c, v]) => (linha as Record<string, unknown>)[c] === v);
              if (!bate) return { data: [], error: null };
              Object.assign(linha, valores);
              return { data: [{ id: linha.id }], error: null };
            },
          };
          return consulta;
        },
      };
    },
  } as unknown as SupabaseClient & { linha: typeof linha };
}

describe("gravação condicional do rascunho", () => {
  it("duas gerações de capa com a mesma leitura: só a primeira trava, a segunda para antes de gastar", async () => {
    const db = bancoFalso({ id: "r1", atualizado_em: "2026-10-18T10:00:00.000Z", estado: {} });
    const lida = db.linha.atualizado_em; // as duas requisições leram a mesma versão
    const agora = new Date().toISOString();
    const primeira = await gravarEstadoVersionado(db, "r1", {}, { capaEmGeracao: agora }, { versao: lida });
    expect(primeira.estado.capaEmGeracao).toBe(agora);
    await expect(gravarEstadoVersionado(db, "r1", {}, { capaEmGeracao: agora }, { versao: lida })).rejects.toThrow(ERRO_CONCORRENCIA);
  });

  it("quem leu depois da trava vê a geração em andamento", () => {
    const agora = Date.parse("2026-10-18T10:00:30.000Z");
    expect(capaEmGeracao({ capaEmGeracao: "2026-10-18T10:00:00.000Z" }, agora)).toBe(true);
    // Trava abandonada (passou do prazo) não bloqueia para sempre.
    expect(capaEmGeracao({ capaEmGeracao: "2026-10-18T09:50:00.000Z" }, agora)).toBe(false);
    expect(capaEmGeracao({}, agora)).toBe(false);
  });

  it("sem versão, grava sempre (comportamento antigo)", async () => {
    const db = bancoFalso({ id: "r1", atualizado_em: "x", estado: {} });
    const r = await gravarEstadoVersionado(db, "r1", {}, { numeroImagens: 3 });
    expect(r.estado.numeroImagens).toBe(3);
  });
});
