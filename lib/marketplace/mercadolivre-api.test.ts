import { describe, expect, it } from "vitest";
import { anunciosDoItemML, credenciaisML, idDoAnuncioML, idNumericoML, pedidoDoML, statusDoML, urlAutorizacaoML } from "./mercadolivre-api";
import { etapaDoMarketplace } from "@/lib/pedidos-central";

describe("Mercado Livre", () => {
  it("credenciais e URL de autorização", () => {
    expect(credenciaisML({})).toBeNull();
    const c = credenciaisML({ ML_CLIENT_ID: "123", ML_CLIENT_SECRET: "s" })!;
    const url = new URL(urlAutorizacaoML(c, "https://x.app/api/mercadolivre/callback", "abc"));
    expect(url.host).toBe("auth.mercadolivre.com.br");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("status do pedido + envio → status e etapa", () => {
    const pago = { status: "paid" };
    expect(statusDoML({ status: "payment_required" }, null).status).toBe("nao_pago");
    expect(statusDoML({ status: "cancelled" }, null).status).toBe("cancelado");
    expect(statusDoML(pago, { status: "pending" })).toEqual({ status: "a_enviar", original: "pending" });
    const pronto = statusDoML(pago, { status: "ready_to_ship", substatus: "ready_to_print" });
    expect(etapaDoMarketplace(pronto.status, pronto.original)).toBe("imprimir");
    const impresso = statusDoML(pago, { status: "ready_to_ship", substatus: "printed" });
    expect(etapaDoMarketplace(impresso.status, impresso.original)).toBe("retirada");
    expect(statusDoML(pago, { status: "shipped" }).status).toBe("enviado");
    expect(statusDoML(pago, { status: "delivered" }).status).toBe("concluido");
    const handling = statusDoML(pago, { status: "handling" });
    expect(etapaDoMarketplace(handling.status, handling.original)).toBe("enviar");
  });

  it("pedido → formato comum, com comissão por unidade e frete do vendedor", () => {
    const p = pedidoDoML(
      {
        id: 2000001,
        status: "paid",
        date_created: "2026-10-01T10:00:00.000-03:00",
        buyer: { nickname: "COMPRADOR1", first_name: "Ana", last_name: "Lima" },
        order_items: [{ item: { id: "MLB1", title: "Caneca", seller_sku: "CAN-1", variation_attributes: [{ name: "Cor", value_name: "Azul" }] }, quantity: 2, unit_price: 50, sale_fee: 7.5 }],
        payments: [{ date_approved: "2026-10-01T10:05:00.000-03:00" }],
        shipping: { id: 99 },
      },
      { status: "ready_to_ship", substatus: "ready_to_print", logistic_type: "drop_off", tracking_number: "BR1", receiver_address: { city: { name: "Feira de Santana" }, state: { id: "BR-BA" } } },
      18.9,
    );
    expect(p).toMatchObject({
      numero: "2000001",
      status: "a_enviar",
      comprador: "Ana Lima",
      cidade: "Feira de Santana",
      uf: "BA",
      rastreio: "BR1",
      logistica: "Mercado Envios",
      subtotal: 100,
      comissao: 15,
      taxaServico: 18.9,
      repasse: 66.1,
    });
    expect(p.itens[0]).toMatchObject({ sku: "CAN-1", variacao: "Azul", quantidade: 2 });
  });

  it("anúncios: item simples e variações com SKU", () => {
    expect(anunciosDoItemML({ id: "MLB123", title: "Caneca", available_quantity: 4, price: 39.9, attributes: [{ id: "SELLER_SKU", value_name: "CAN" }] })).toEqual([
      { itemId: 123, modelId: 0, sku: "CAN", skuPrincipal: "CAN", nome: "Caneca", estoque: 4, preco: 39.9 },
    ]);
    const v = anunciosDoItemML({ id: "MLB9", title: "Camiseta", price: 50, variations: [{ id: 55, available_quantity: 2, seller_custom_field: "CAM-P", attribute_combinations: [{ value_name: "P" }] }, { id: 56, price: 55, attribute_combinations: [{ value_name: "G" }] }] });
    expect(v[0]).toMatchObject({ itemId: 9, modelId: 55, sku: "CAM-P", nome: "Camiseta · P", estoque: 2, preco: 50 });
    // Variação com preço próprio usa o dela; sem preço, o do item.
    expect(v[1].preco).toBe(55);
    expect(idDoAnuncioML(idNumericoML("MLB4455667788"))).toBe("MLB4455667788");
  });
});
