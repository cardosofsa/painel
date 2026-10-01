import { z } from "zod";

const valor = z.number().finite().min(0).max(10_000_000);
const texto = (max: number) => z.string().trim().max(max).nullable();
const isoData = z.string().max(40).nullable();

/** O que a tela manda para `importar_pedidos_marketplace` (0046). */
export const pedidosMarketplaceSchema = z
  .array(
    z.object({
      numero: z.string().trim().min(1).max(80),
      status: z.enum(["nao_pago", "a_enviar", "enviado", "concluido", "cancelado", "devolvido"]),
      status_original: z.string().max(80),
      criado_em: isoData,
      pago_em: isoData,
      comprador: texto(120),
      cidade: texto(120),
      uf: texto(2),
      rastreio: texto(80),
      logistica: texto(80).optional(),
      prazo_envio: isoData.optional(),
      subtotal: valor,
      desconto_vendedor: valor,
      cupom_vendedor: valor,
      comissao: valor,
      taxa_servico: valor,
      taxa_transacao: valor,
      frete_comprador: valor,
      repasse: z.number().finite().min(-10_000_000).max(10_000_000),
      custo: valor,
      imposto: valor,
      lucro: z.number().finite().min(-10_000_000).max(10_000_000),
      custo_incompleto: z.boolean(),
      itens: z
        .array(
          z.object({
            produto_id: z.string().uuid().nullable(),
            sku: texto(120),
            sku_principal: texto(120),
            nome: z.string().trim().min(1).max(300),
            variacao: texto(200),
            quantidade: z.number().int().min(1).max(100_000),
            preco_unitario: valor,
            custo_unitario: valor.nullable(),
          }),
        )
        .max(200),
    }),
  )
  .min(1, "Nenhum pedido para importar.")
  .max(2000, "Importe no máximo 2.000 pedidos por vez.");

export const vinculosMarketplaceSchema = z
  .array(z.object({ sku_externo: z.string().trim().min(1).max(300), produto_id: z.string().uuid() }))
  .max(500);
