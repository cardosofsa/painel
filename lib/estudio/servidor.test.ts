import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baixarImagemDaConta, capaEmGeracao, ERRO_CONCORRENCIA, gravarEstadoVersionado, lerMensagem } from "./servidor";

/** Uma linha de `anuncio_rascunhos` com o UPDATE condicional do PostgREST (`eq` em cada filtro). */
function bancoFalso(linha: { id: string; atualizado_em: string; estado: unknown }) {
  return {
    linha,
    from() {
      return {
        select() {
          const filtros: [string, unknown][] = [];
          const consulta = {
            eq(col: string, val: unknown) {
              filtros.push([col, val]);
              return consulta;
            },
            async maybeSingle() {
              const bate = filtros.every(([c, v]) => (linha as Record<string, unknown>)[c] === v);
              return { data: bate ? { estado: linha.estado, atualizado_em: linha.atualizado_em } : null, error: null };
            },
          };
          return consulta;
        },
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

  it("duas ações com a mesma leitura velha: as duas mudanças ficam (antes a segunda apagava a primeira)", async () => {
    const db = bancoFalso({ id: "r1", atualizado_em: "2026-10-18T10:00:00.000Z", estado: { numeroImagens: 3 } });
    const lidaNoComeco = { numeroImagens: 3 }; // as duas ações carregaram este estado
    await gravarEstadoVersionado(db, "r1", lidaNoComeco, { variantes: [{ titulo: "Caneca Azul", angulo: "busca" }] });
    await gravarEstadoVersionado(db, "r1", lidaNoComeco, { numeroImagens: 5 });
    const final = db.linha.estado as { numeroImagens?: number; variantes?: unknown[] };
    expect(final.numeroImagens).toBe(5);
    expect(final.variantes).toHaveLength(1);
  });

  it("sem versão, grava sempre (comportamento antigo)", async () => {
    const db = bancoFalso({ id: "r1", atualizado_em: "x", estado: {} });
    const r = await gravarEstadoVersionado(db, "r1", {}, { numeroImagens: 3 });
    expect(r.estado.numeroImagens).toBe(3);
  });
});

describe("baixarImagemDaConta (imagens do chat)", () => {
  const dono = "11111111-1111-1111-1111-111111111111";
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("recusa caminho de outra conta ou que sobe de pasta, sem nem buscar", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    const busca = vi.fn();
    vi.stubGlobal("fetch", busca);
    await expect(baixarImagemDaConta(dono, "22222222-2222-2222-2222-222222222222/estudio-chat-1.jpg")).rejects.toThrow(/sua conta/);
    await expect(baixarImagemDaConta(dono, `${dono}/../outro/x.jpg`)).rejects.toThrow(/sua conta/);
    expect(busca).not.toHaveBeenCalled();
  });

  it("busca só no Storage do projeto, sem seguir redirecionamento, e devolve a impressão digital dos bytes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    const busca = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", busca);
    const r = await baixarImagemDaConta(dono, `${dono}/estudio-chat-1.png`);
    const [url, opcoes] = busca.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://projeto.supabase.co/storage/v1/object/public/produtos/${dono}/estudio-chat-1.png`);
    expect(opcoes.redirect).toBe("error");
    expect(r.mime).toBe("image/png");
    expect(r.hash).toHaveLength(64);
  });

  it("recusa o que não é imagem", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })));
    await expect(baixarImagemDaConta(dono, `${dono}/estudio-chat-1.png`)).rejects.toThrow(/JPG, PNG ou WebP/);
  });
});

describe("lerMensagem", () => {
  it("sem as colunas da 0110, vem sem ações feitas e sem anexos", () => {
    const m = lerMensagem({ id: "1", papel: "ia", texto: "oi", acoes: [{ tipo: "pesquisar_concorrentes" }], criado_em: "2026-01-01" });
    expect(m.acoesFeitas).toEqual([]);
    expect(m.anexos).toEqual([]);
  });
  it("lê as ações feitas e os anexos válidos", () => {
    const m = lerMensagem({ id: "1", papel: "usuario", texto: "olha", acoes: [], acoes_feitas: [0, 2, "x"], anexos: [{ tipo: "imagem", path: "u/estudio-chat-1.jpg" }, { tipo: "imagem", path: "../x.jpg" }], criado_em: "" });
    expect(m.acoesFeitas).toEqual([0, 2]);
    expect(m.anexos).toEqual([{ tipo: "imagem", path: "u/estudio-chat-1.jpg" }]);
  });
});
