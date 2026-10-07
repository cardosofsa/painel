import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conferirCotaFrete, decidirCotaFrete, funcaoAusente } from "./cota";

type Resposta = { data: unknown; error: { code: string; message: string } | null };

function servicoFalso(respostas: Record<string, Resposta>) {
  const rpc = vi.fn(async (nome: string) => respostas[nome] ?? { data: null, error: { code: "PGRST202", message: "ausente" } });
  return { cliente: { rpc } as unknown as SupabaseClient, rpc };
}

const AUSENTE = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

describe("cota do frete da vitrine (0077)", () => {
  it("decide pelo banco e desempata o false pela conta do dono", () => {
    expect(decidirCotaFrete(true, null)).toBe("livre");
    expect(decidirCotaFrete(false, true)).toBe("limitada");
    expect(decidirCotaFrete(false, null)).toBe("limitada");
    expect(decidirCotaFrete(false, false)).toBe("inativa");
    // RPC ausente (antes da 0077): segue como hoje, mas conta suspensa não cota.
    expect(decidirCotaFrete(null, null)).toBe("livre");
    expect(decidirCotaFrete(null, true)).toBe("livre");
    expect(decidirCotaFrete(null, false)).toBe("inativa");
  });

  it("reconhece função ausente", () => {
    expect(funcaoAusente({ code: "PGRST202" })).toBe(true);
    expect(funcaoAusente({ code: "42883" })).toBe(true);
    expect(funcaoAusente({ code: "42501" })).toBe(false);
    expect(funcaoAusente(null)).toBe(false);
  });

  it("liberada: não consulta a conta", async () => {
    const { cliente, rpc } = servicoFalso({ vitrine_frete_permitido: { data: true, error: null } });
    expect(await conferirCotaFrete(cliente, "loja", "h", "dono")).toBe("livre");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("vitrine_frete_permitido", { p_slug: "loja", p_ip_hash: "h" });
  });

  it("recusada com conta ativa = limite; com conta suspensa = desligado", async () => {
    const limitada = servicoFalso({ vitrine_frete_permitido: { data: false, error: null }, conta_ativa_de: { data: true, error: null } });
    expect(await conferirCotaFrete(limitada.cliente, "loja", "h", "dono")).toBe("limitada");
    const suspensa = servicoFalso({ vitrine_frete_permitido: { data: false, error: null }, conta_ativa_de: { data: false, error: null } });
    expect(await conferirCotaFrete(suspensa.cliente, "loja", "h", "dono")).toBe("inativa");
  });

  it("antes da migração: segue, mas confere a conta se a função existir", async () => {
    const semNada = servicoFalso({ vitrine_frete_permitido: AUSENTE, conta_ativa_de: AUSENTE });
    expect(await conferirCotaFrete(semNada.cliente, "loja", null, "dono")).toBe("livre");
    const suspensa = servicoFalso({ vitrine_frete_permitido: AUSENTE, conta_ativa_de: { data: false, error: null } });
    expect(await conferirCotaFrete(suspensa.cliente, "loja", null, "dono")).toBe("inativa");
  });
});
