import { describe, expect, it } from "vitest";
import { INTERVALO_MINIMO_NOTIFICACAO_MS, lerNotificacaoML, sincronizouHaPouco, TAMANHO_MAXIMO_NOTIFICACAO } from "./notificacao-ml";

const APP = "5503910054141466";
const corpo = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    _id: "d3b8c1",
    resource: "/orders/2000003508419013",
    user_id: 468424240,
    topic: "orders_v2",
    application_id: Number(APP),
    attempts: 1,
    sent: "2026-10-07T12:00:00.000Z",
    ...extra,
  });

describe("lerNotificacaoML", () => {
  it("pedido do nosso app: devolve vendedor e pedido", () => {
    expect(lerNotificacaoML(corpo(), APP)).toEqual({ ok: true, sellerId: "468424240", pedido: "2000003508419013", envio: null });
  });

  it("envio: devolve o envio, sem pedido", () => {
    expect(lerNotificacaoML(corpo({ resource: "/shipments/43219876543", topic: "shipments" }), APP)).toEqual({
      ok: true,
      sellerId: "468424240",
      pedido: null,
      envio: "43219876543",
    });
  });

  it("aceita os ids como texto", () => {
    const r = lerNotificacaoML(corpo({ user_id: "468424240", application_id: APP }), APP);
    expect(r).toMatchObject({ ok: true, sellerId: "468424240" });
  });

  it("application_id acima de 2^53 é comparado pelos dígitos do texto, não pelo número arredondado", () => {
    const grande = "9007199254740993123"; // vira 9007199254740993000 no JSON.parse
    const texto = `{"resource":"/orders/2000003508419013","user_id":468424240,"application_id":${grande},"topic":"orders_v2"}`;
    expect(lerNotificacaoML(texto, grande)).toMatchObject({ ok: true });
    expect(lerNotificacaoML(texto, "9007199254740993000")).toEqual({ ok: false, motivo: "app" });
  });

  it("recusa aviso de outro app, ou sem app configurado", () => {
    expect(lerNotificacaoML(corpo({ application_id: 1234567890123456 }), APP)).toEqual({ ok: false, motivo: "app" });
    expect(lerNotificacaoML(corpo(), "")).toEqual({ ok: false, motivo: "app" });
    expect(lerNotificacaoML(corpo({ application_id: `${APP}0` }), APP)).toEqual({ ok: false, motivo: "app" });
  });

  it("recusa corpo inválido: não-JSON, vazio, grande demais, sem campos, tipos errados", () => {
    expect(lerNotificacaoML("", APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML("{oi", APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML("null", APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML(corpo({ x: "a".repeat(TAMANHO_MAXIMO_NOTIFICACAO) }), APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML(JSON.stringify({ resource: "/orders/2000003508419013", user_id: 468424240 }), APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML(corpo({ user_id: "abc" }), APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML(corpo({ user_id: -5 }), APP)).toEqual({ ok: false, motivo: "corpo" });
    expect(lerNotificacaoML(corpo({ resource: 123 }), APP)).toEqual({ ok: false, motivo: "corpo" });
  });

  it("recusa vendedor fora do formato", () => {
    expect(lerNotificacaoML(corpo({ user_id: 12 }), APP)).toEqual({ ok: false, motivo: "vendedor" });
    expect(lerNotificacaoML(corpo({ user_id: 1.5 }), APP)).toEqual({ ok: false, motivo: "vendedor" });
  });

  it("recusa recurso que não é pedido nem envio", () => {
    for (const resource of ["/items/MLB123456", "/orders/12", "/orders/2000003508419013/feedback", "orders/2000003508419013", "/questions/123456"]) {
      expect(lerNotificacaoML(corpo({ resource }), APP)).toEqual({ ok: false, motivo: "recurso" });
    }
  });
});

describe("sincronizouHaPouco", () => {
  const agora = Date.parse("2026-10-07T12:00:00.000Z");

  it("segura quem sincronizou há menos de 60 s", () => {
    expect(sincronizouHaPouco("2026-10-07T11:59:30.000Z", agora)).toBe(true);
    expect(sincronizouHaPouco(new Date(agora - INTERVALO_MINIMO_NOTIFICACAO_MS + 1).toISOString(), agora)).toBe(true);
  });

  it("libera a partir de 60 s, sem data ou com data inválida", () => {
    expect(sincronizouHaPouco(new Date(agora - INTERVALO_MINIMO_NOTIFICACAO_MS).toISOString(), agora)).toBe(false);
    expect(sincronizouHaPouco("2026-10-07T10:00:00.000Z", agora)).toBe(false);
    expect(sincronizouHaPouco(null, agora)).toBe(false);
    expect(sincronizouHaPouco(undefined, agora)).toBe(false);
    expect(sincronizouHaPouco("ontem", agora)).toBe(false);
  });

  it("relógio adiantado conta como há pouco só até o mesmo intervalo", () => {
    expect(sincronizouHaPouco("2026-10-07T12:00:20.000Z", agora)).toBe(true);
    expect(sincronizouHaPouco("2026-10-07T13:00:00.000Z", agora)).toBe(false);
  });
});
