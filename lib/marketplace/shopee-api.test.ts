import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinar, credenciaisShopee, faltandoShopee, pedidoDaApi, statusDaApi, ufDoEstado, urlAutorizacao } from "./shopee-api";

const c = { partnerId: 123, partnerKey: "segredo", host: "https://partner.shopeemobile.com" };

describe("credenciaisShopee", () => {
  it("desligada sem as variáveis", () => {
    expect(credenciaisShopee({})).toBeNull();
    expect(credenciaisShopee({ SHOPEE_PARTNER_ID: "abc", SHOPEE_PARTNER_KEY: "k" })).toBeNull();
  });
  it("faltandoShopee diz só os nomes do que falta", () => {
    expect(faltandoShopee({})).toEqual(["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"]);
    expect(faltandoShopee({ SHOPEE_PARTNER_ID: " 123 ", SHOPEE_PARTNER_KEY: "" })).toEqual(["SHOPEE_PARTNER_KEY"]);
    expect(faltandoShopee({ SHOPEE_PARTNER_ID: "12a", SHOPEE_PARTNER_KEY: "k" })).toEqual(["SHOPEE_PARTNER_ID"]);
    expect(faltandoShopee({ SHOPEE_PARTNER_ID: "123", SHOPEE_PARTNER_KEY: "k" })).toEqual([]);
  });
  it("lê id, chave e ambiente de teste", () => {
    expect(credenciaisShopee({ SHOPEE_PARTNER_ID: "123", SHOPEE_PARTNER_KEY: "k", SHOPEE_AMBIENTE: "teste" })?.host).toContain("test-stable");
  });
});

describe("assinatura", () => {
  it("HMAC de partner_id + caminho + timestamp (+ token + loja)", () => {
    const esperado = createHmac("sha256", "segredo").update("123/api/v2/shop/auth_partner1700000000").digest("hex");
    expect(assinar(c, "/api/v2/shop/auth_partner", 1700000000)).toBe(esperado);
    const loja = createHmac("sha256", "segredo").update("123/api/v2/order/get_order_list1700000000TOK999").digest("hex");
    expect(assinar(c, "/api/v2/order/get_order_list", 1700000000, "TOK", 999)).toBe(loja);
  });
  it("URL de autorização leva redirect e assinatura", () => {
    const u = new URL(urlAutorizacao(c, "https://app/api/shopee/callback?loja=1", 1700000000));
    expect(u.pathname).toBe("/api/v2/shop/auth_partner");
    expect(u.searchParams.get("redirect")).toBe("https://app/api/shopee/callback?loja=1");
    expect(u.searchParams.get("sign")).toBe(assinar(c, "/api/v2/shop/auth_partner", 1700000000));
  });
});

describe("conversão", () => {
  it("status da API", () => {
    expect(statusDaApi("READY_TO_SHIP")).toBe("a_enviar");
    expect(statusDaApi("SHIPPED")).toBe("enviado");
    expect(statusDaApi("COMPLETED")).toBe("concluido");
    expect(statusDaApi("CANCELLED")).toBe("cancelado");
    expect(statusDaApi("UNPAID")).toBe("nao_pago");
    expect(statusDaApi("TO_RETURN")).toBe("devolvido");
  });
  it("UF a partir do estado por extenso", () => {
    expect(ufDoEstado("São Paulo")).toBe("SP");
    expect(ufDoEstado("pe")).toBe("PE");
    expect(ufDoEstado("")).toBeNull();
  });
  it("pedido + escrow viram o formato da planilha; escrow manda no repasse", () => {
    const p = pedidoDaApi(
      {
        order_sn: "2405XYZ",
        order_status: "COMPLETED",
        create_time: 1715350000,
        buyer_username: "ana",
        recipient_address: { city: "Recife", state: "Pernambuco" },
        item_list: [{ item_name: "Fita", item_sku: "FITA", model_sku: "FITA-P", model_name: "Preta", model_quantity_purchased: 2, model_discounted_price: 34.9 }],
      },
      { escrow_amount: 50.1, commission_fee: 11.17, service_fee: 4.19, seller_transaction_fee: 1.4 },
    );
    expect(p.status).toBe("concluido");
    expect(p.uf).toBe("PE");
    expect(p.subtotal).toBe(69.8);
    expect(p.repasse).toBe(50.1);
    expect(p.itens[0]).toMatchObject({ sku: "FITA-P", skuPrincipal: "FITA", quantidade: 2 });
    expect(p.criadoEm).toBe(new Date(1715350000 * 1000).toISOString());
  });
  it("sem escrow calcula o repasse; cancelado zera", () => {
    const base = { order_sn: "A", item_list: [{ model_quantity_purchased: 1, model_discounted_price: 100 }] };
    expect(pedidoDaApi({ ...base, order_status: "READY_TO_SHIP" }, null).repasse).toBe(100);
    expect(pedidoDaApi({ ...base, order_status: "CANCELLED" }, null).repasse).toBe(0);
  });
});
