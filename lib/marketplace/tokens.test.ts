import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cofre de mentira: "cifrar" só marca o texto.
vi.mock("@/lib/ia/cofre", () => ({ cifrar: (t: string) => `c:${t}`, decifrar: (t: string) => t.replace(/^c:/, "") }));

const { tokenValido } = await import("./tokens");

type Linha = { access_token_cifrado: string; refresh_token_cifrado: string; expira_em: string };

/** Supabase mínimo: lê e grava uma linha de `marketplace_conexoes`. */
function banco(linha: Linha, erroAoGravar = false) {
  const gravacoes: Partial<Linha>[] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...linha } }) }) }),
      update: (v: Partial<Linha>) => ({
        eq: async () => {
          if (erroAoGravar) return { error: { message: "falhou" } };
          gravacoes.push(v);
          Object.assign(linha, v);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { supabase, gravacoes, linha };
}

const futuro = () => new Date(Date.now() + 3600_000).toISOString();
const passado = () => new Date(Date.now() - 1000).toISOString();
const conexao = (l: Linha) => ({ id: "c1", user_id: "u", loja_id: "l", shop_id: "1", ultima_sincronizacao: null, ...l });

describe("tokenValido", () => {
  it("token em dia: não renova", async () => {
    const l = { access_token_cifrado: "c:A1", refresh_token_cifrado: "c:R1", expira_em: futuro() };
    const renovar = vi.fn();
    expect(await tokenValido(banco(l).supabase, conexao(l), "aad", renovar, "da Shopee")).toBe("A1");
    expect(renovar).not.toHaveBeenCalled();
  });

  it("vencido: renova e grava o par novo", async () => {
    const l = { access_token_cifrado: "c:A1", refresh_token_cifrado: "c:R1", expira_em: passado() };
    const b = banco(l);
    const renovar = vi.fn(async () => ({ accessToken: "A2", refreshToken: "R2", expiraEm: futuro() }));
    expect(await tokenValido(b.supabase, conexao(l), "aad", renovar, "da Shopee")).toBe("A2");
    expect(renovar).toHaveBeenCalledWith("R1");
    expect(b.linha.refresh_token_cifrado).toBe("c:R2");
  });

  it("erro ao gravar o token novo não passa em silêncio", async () => {
    const l = { access_token_cifrado: "c:A1", refresh_token_cifrado: "c:R1", expira_em: passado() };
    const renovar = async () => ({ accessToken: "A2", refreshToken: "R2", expiraEm: futuro() });
    await expect(tokenValido(banco(l, true).supabase, conexao(l), "aad", renovar, "da Shopee")).rejects.toThrow(/guardar o token renovado da Shopee/);
  });

  it("outra renovação gastou o refresh_token: usa o par que ela gravou", async () => {
    const l = { access_token_cifrado: "c:A1", refresh_token_cifrado: "c:R1", expira_em: passado() };
    const b = banco(l);
    const renovar = vi.fn(async () => {
      // O cron renovou primeiro e gravou; esta tentativa recebe "refresh token inválido".
      Object.assign(b.linha, { access_token_cifrado: "c:A9", refresh_token_cifrado: "c:R9", expira_em: futuro() });
      throw new Error("Shopee: invalid refresh_token");
    });
    expect(await tokenValido(b.supabase, conexao(l), "aad", renovar, "da Shopee")).toBe("A9");
  });
});
