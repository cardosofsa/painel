import { describe, it, expect, afterEach, vi } from "vitest";
import { captchaAtivo, chaveCaptcha, faltaCaptcha, opcoesCaptcha, SCRIPT_TURNSTILE, ORIGEM_TURNSTILE } from "./captcha";

describe("chaveCaptcha / captchaAtivo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem a variável, o captcha fica desligado", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(chaveCaptcha()).toBeNull();
    expect(captchaAtivo()).toBe(false);
  });

  it("variável só com espaço também é desligado", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "   ");
    expect(captchaAtivo()).toBe(false);
  });

  it("com a variável, liga e devolve a chave sem espaço", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", " 0x4AAAAAAA ");
    expect(chaveCaptcha()).toBe("0x4AAAAAAA");
    expect(captchaAtivo()).toBe(true);
  });
});

describe("opcoesCaptcha", () => {
  it("só manda captchaToken quando há token", () => {
    expect(opcoesCaptcha("abc")).toEqual({ captchaToken: "abc" });
    expect(opcoesCaptcha(null)).toEqual({});
    expect(opcoesCaptcha(undefined)).toEqual({});
    expect(opcoesCaptcha("")).toEqual({});
  });
});

describe("faltaCaptcha", () => {
  it("desligado nunca bloqueia o envio", () => {
    expect(faltaCaptcha(null, false)).toBe(false);
  });

  it("ligado bloqueia até haver token", () => {
    expect(faltaCaptcha(null, true)).toBe(true);
    expect(faltaCaptcha("", true)).toBe(true);
    expect(faltaCaptcha("tok", true)).toBe(false);
  });
});

it("o script vem da mesma origem liberada na CSP", () => {
  expect(new URL(SCRIPT_TURNSTILE).origin).toBe(ORIGEM_TURNSTILE);
});
