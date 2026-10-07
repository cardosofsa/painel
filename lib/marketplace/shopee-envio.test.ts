import { describe, expect, it } from "vitest";
import { montarShipOrder, tipoEtiqueta, type ParametroEnvio } from "./shopee-envio";

const coleta: ParametroEnvio = {
  info_needed: { pickup: ["address_id", "pickup_time_id"] },
  pickup: {
    address_list: [
      { address_id: 1, city: "Outra", address_flag: ["default_address"], time_slot_list: [] },
      { address_id: 2, city: "Feira de Santana", address_flag: ["pickup_address"], time_slot_list: [{ pickup_time_id: "t1", time_text: "08:00-12:00", date: 1790000000 }, { pickup_time_id: "t2", flags: ["recommended"] }] },
    ],
  },
};

describe("montarShipOrder", () => {
  it("coleta usa o endereço de coleta e o horário recomendado", () => {
    const r = montarShipOrder("SN1", coleta, "pickup", "Loja");
    expect(r).toMatchObject({ ok: true, modo: "pickup", corpo: { order_sn: "SN1", pickup: { address_id: 2, pickup_time_id: "t2" } } });
  });

  it("sem horário quando a coleta pede horário: explica", () => {
    const p: ParametroEnvio = { info_needed: { pickup: ["address_id", "pickup_time_id"] }, pickup: { address_list: [{ address_id: 1, time_slot_list: [] }] } };
    expect(montarShipOrder("SN1", p, "pickup", "Loja")).toMatchObject({ ok: false });
  });

  it("prefere postagem quando pedido, e cai para coleta se a logística não aceita", () => {
    expect(montarShipOrder("SN1", coleta, "dropoff", "Loja")).toMatchObject({ ok: true, modo: "pickup" });
    const ambos: ParametroEnvio = { ...coleta, info_needed: { ...coleta.info_needed, dropoff: [] } };
    expect(montarShipOrder("SN1", ambos, "dropoff", "Loja")).toMatchObject({ ok: true, modo: "dropoff", corpo: { order_sn: "SN1", dropoff: {} } });
  });

  it("postagem com agência e remetente quando a Shopee pede", () => {
    const p: ParametroEnvio = { info_needed: { dropoff: ["branch_id", "sender_real_name"] }, dropoff: { branch_list: [{ branch_id: 77 }] } };
    expect(montarShipOrder("SN1", p, "dropoff", "Minha Loja")).toMatchObject({ ok: true, corpo: { dropoff: { branch_id: 77, sender_real_name: "Minha Loja" } } });
  });

  it("logística sem integração ou sem liberação: erro claro", () => {
    expect(montarShipOrder("SN1", { info_needed: { non_integrated: ["tracking_number"] } }, "pickup", "L")).toMatchObject({ ok: false, erro: expect.stringMatching(/Central do Vendedor/) });
    expect(montarShipOrder("SN1", {}, "pickup", "L")).toMatchObject({ ok: false, erro: expect.stringMatching(/não liberou/) });
  });
});

describe("tipoEtiqueta", () => {
  it("térmica (10×15) sempre que a logística aceita, mesmo com a NORMAL sugerida", () => {
    expect(tipoEtiqueta("NORMAL_AIR_WAYBILL", ["NORMAL_AIR_WAYBILL", "THERMAL_AIR_WAYBILL"])).toBe("THERMAL_AIR_WAYBILL");
    expect(tipoEtiqueta("NORMAL_AIR_WAYBILL", ["NORMAL_AIR_WAYBILL"])).toBe("NORMAL_AIR_WAYBILL");
    expect(tipoEtiqueta(undefined, ["NORMAL_AIR_WAYBILL"])).toBe("NORMAL_AIR_WAYBILL");
  });
  it("sem a lista de opções: usa a sugerida e cai para a térmica", () => {
    expect(tipoEtiqueta("NORMAL_AIR_WAYBILL")).toBe("NORMAL_AIR_WAYBILL");
    expect(tipoEtiqueta(undefined)).toBe("THERMAL_AIR_WAYBILL");
    expect(tipoEtiqueta("ALGO")).toBe("THERMAL_AIR_WAYBILL");
  });
});
