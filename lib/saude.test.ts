import { describe, expect, it } from "vitest";
import {
  bancoRespondeu,
  comTempoLimite,
  idadeSincronizacaoMaisAntigaMin,
  montarSaude,
  SINCRONIZACAO_ATRASADA_MIN,
  VARIAVEIS_ESSENCIAIS,
  variaveisPresentes,
} from "./saude";

const todas = Object.fromEntries(VARIAVEIS_ESSENCIAIS.map((v) => [v, true])) as ReturnType<typeof variaveisPresentes>;
const agora = new Date("2026-10-07T12:00:00.000Z");

describe("variaveisPresentes", () => {
  it("só booleanos, nunca o valor; vazio e espaço contam como ausente", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "segredo-que-nao-pode-vazar",
      CRON_SECRET: "",
      IA_CHAVE_COFRE: "   ",
      GEMINI_API_KEY: "abc",
      OUTRA: "ignorada",
    };
    const r = variaveisPresentes(env);
    expect(r).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: true,
      SUPABASE_SERVICE_ROLE_KEY: true,
      CRON_SECRET: false,
      IA_CHAVE_COFRE: false,
    });
    expect(JSON.stringify(r)).not.toContain("segredo");
    expect(Object.values(r).every((v) => typeof v === "boolean")).toBe(true);
  });
});

describe("bancoRespondeu", () => {
  it("sem erro, ou função ainda não criada pela migração: respondeu", () => {
    expect(bancoRespondeu(null)).toBe(true);
    expect(bancoRespondeu(undefined)).toBe(true);
    expect(bancoRespondeu({ code: "PGRST202" })).toBe(true);
    expect(bancoRespondeu({ code: "42883" })).toBe(true);
  });

  it("rede, tempo esgotado (code vazio) ou PostgREST sem Postgres: não respondeu", () => {
    expect(bancoRespondeu({ code: "" })).toBe(false);
    expect(bancoRespondeu({ code: null })).toBe(false);
    expect(bancoRespondeu({})).toBe(false);
    expect(bancoRespondeu({ code: "PGRST002" })).toBe(false);
    expect(bancoRespondeu({ code: "57014" })).toBe(false);
  });
});

describe("idadeSincronizacaoMaisAntigaMin", () => {
  const ativas = new Set(["a", "b"]);

  it("a mais antiga entre as contas ativas, em minutos inteiros", () => {
    const r = idadeSincronizacaoMaisAntigaMin(
      [
        { user_id: "a", ultima_sincronizacao: "2026-10-07T11:30:00.000Z", criado_em: "2026-01-01T00:00:00.000Z" },
        { user_id: "b", ultima_sincronizacao: "2026-10-07T09:59:30.000Z", criado_em: "2026-01-01T00:00:00.000Z" },
        // Conta suspensa: não conta, mesmo sendo a mais velha.
        { user_id: "c", ultima_sincronizacao: "2026-09-01T00:00:00.000Z", criado_em: "2026-01-01T00:00:00.000Z" },
      ],
      ativas,
      agora.getTime(),
    );
    expect(r).toBe(120);
  });

  it("nunca sincronizou: conta desde a criação da conexão", () => {
    const r = idadeSincronizacaoMaisAntigaMin([{ user_id: "a", ultima_sincronizacao: null, criado_em: "2026-10-06T12:00:00.000Z" }], ativas, agora.getTime());
    expect(r).toBe(24 * 60);
  });

  it("sem conexão ativa ou só datas inválidas: null", () => {
    expect(idadeSincronizacaoMaisAntigaMin([], ativas, agora.getTime())).toBeNull();
    expect(idadeSincronizacaoMaisAntigaMin([{ user_id: "c", ultima_sincronizacao: "2026-10-07T11:00:00.000Z", criado_em: null }], ativas, agora.getTime())).toBeNull();
    expect(idadeSincronizacaoMaisAntigaMin([{ user_id: "a", ultima_sincronizacao: null, criado_em: null }], ativas, agora.getTime())).toBeNull();
  });

  it("data no futuro (relógio) não vira idade negativa", () => {
    expect(idadeSincronizacaoMaisAntigaMin([{ user_id: "a", ultima_sincronizacao: "2026-10-07T12:05:00.000Z", criado_em: null }], ativas, agora.getTime())).toBe(0);
  });
});

describe("montarSaude", () => {
  it("tudo certo: ok, sem alertas", () => {
    const s = montarSaude({ banco: { ok: true, ms: 80 }, variaveis: todas, sincronizacaoMin: 30, agora });
    expect(s).toEqual({
      status: "ok",
      verificado_em: "2026-10-07T12:00:00.000Z",
      banco: { ok: true, ms: 80 },
      variaveis: todas,
      sincronizacao: { mais_antiga_min: 30 },
      alertas: [],
    });
  });

  it("variável faltando ou sincronização atrasada: degradado, com o motivo", () => {
    const s = montarSaude({
      banco: { ok: true, ms: 80 },
      variaveis: { ...todas, CRON_SECRET: false, IA_CHAVE_COFRE: false },
      sincronizacaoMin: SINCRONIZACAO_ATRASADA_MIN + 120,
      agora,
    });
    expect(s.status).toBe("degradado");
    expect(s.alertas).toEqual(["Variável ausente: CRON_SECRET, IA_CHAVE_COFRE.", "Há loja sem sincronizar há 28 h."]);
  });

  it("no limite das 26 h ainda não é atraso; sem medida, sincronizacao é null", () => {
    expect(montarSaude({ banco: { ok: true, ms: 1 }, variaveis: todas, sincronizacaoMin: SINCRONIZACAO_ATRASADA_MIN, agora }).status).toBe("ok");
    expect(montarSaude({ banco: { ok: true, ms: 1 }, variaveis: todas, sincronizacaoMin: null, agora }).sincronizacao).toBeNull();
  });

  it("banco fora: fora, mesmo com o resto em ordem", () => {
    const s = montarSaude({ banco: { ok: false, ms: 4000 }, variaveis: todas, sincronizacaoMin: 10, agora });
    expect(s.status).toBe("fora");
    expect(s.alertas).toEqual(["O banco não respondeu."]);
  });
});

describe("comTempoLimite", () => {
  it("devolve o resultado quando chega a tempo", async () => {
    await expect(comTempoLimite(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejeita quando passa do limite", async () => {
    await expect(comTempoLimite(new Promise((r) => setTimeout(() => r(1), 200)), 10)).rejects.toThrow("tempo esgotado");
  });

  it("repassa a rejeição da própria promessa", async () => {
    await expect(comTempoLimite(Promise.reject(new Error("rede")), 50)).rejects.toThrow("rede");
  });
});
