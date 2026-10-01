import { z } from "zod";
import { formatBRL } from "./format";

/**
 * Carrinho da vitrine pública e o pedido que ele gera.
 *
 * Tudo aqui é puro — sem React, sem Supabase — porque é a única parte deste recurso que o
 * vitest alcança: o `vitest.config.ts` roda em `environment: "node"` e mede cobertura só de
 * `lib/**`. A segurança de verdade mora na RPC `criar_pedido_vitrine` (migração 0027), que
 * nenhum teste daqui consegue exercitar; por isso os limites abaixo são **exportados e
 * testados**, para que mudar um número force lembrar do `check` que o espelha no banco.
 */

export const MAX_ITENS = 50;
export const MAX_QTD = 99;
export const MAX_NOME = 120;
export const MAX_WHATSAPP = 15;
export const MAX_OBSERVACAO = 500;

/**
 * Teto prático da URL do `wa.me`. O WhatsApp corta links muito longos sem avisar — o
 * usuário clica e não acontece nada, ou a mensagem chega truncada no meio de uma palavra.
 * Um carrinho de 50 itens estoura isso com folga, e é um bug que nunca aparece em
 * desenvolvimento com dois itens no carrinho.
 */
export const MAX_URL_WHATSAPP = 3500;

/** Outra variante do mesmo produto que o cliente pode escolher na própria linha do carrinho. */
export interface OpcaoVariante {
  produto_id: string;
  rotulo: string;
  preco: number;
}

export interface ItemCarrinhoVitrine {
  produto_id: string;
  /** Nome já com a variante ("Camiseta — Azul P"), como o cliente viu na tela. */
  nome: string;
  /** Nome sem a variante ("Camiseta"), para remontar o rótulo ao trocar de opção. */
  nomeBase?: string;
  preco: number;
  quantidade: number;
  /** Só existe quando o produto tem 2+ variantes com preço. */
  opcoes?: OpcaoVariante[];
}

/**
 * Consolida o carrinho: o mesmo SKU adicionado duas vezes vira **uma** linha.
 *
 * Não é cosmético. `registrar_venda` agrega por produto antes de conferir estoque
 * (`0018_pdv_vendas.sql:328-340`) justamente porque validar linha a linha deixaria passar
 * 3 + 3 com estoque 5. Consolidar aqui faz o pedido, a mensagem do WhatsApp e a futura
 * venda contarem a mesma história.
 */
export function consolidarCarrinho(itens: ItemCarrinhoVitrine[]): ItemCarrinhoVitrine[] {
  const mapa = new Map<string, ItemCarrinhoVitrine>();
  for (const item of itens) {
    const existente = mapa.get(item.produto_id);
    if (existente) existente.quantidade += item.quantidade;
    else mapa.set(item.produto_id, { ...item });
  }
  return [...mapa.values()];
}

/** Total do carrinho, arredondado a centavo em cada linha antes de somar. */
export function totalCarrinho(itens: ItemCarrinhoVitrine[]): number {
  const centavos = itens.reduce((acc, i) => acc + Math.round(i.preco * 100) * i.quantidade, 0);
  return centavos / 100;
}

export function quantidadeTotal(itens: ItemCarrinhoVitrine[]): number {
  return itens.reduce((acc, i) => acc + i.quantidade, 0);
}

/**
 * O que o navegador manda para a RPC.
 *
 * Repare no que **não** está aqui: preço. O carrinho vive no navegador do cliente, então
 * tudo que ele envia é suspeito. A RPC recalcula cada preço a partir do catálogo; se o
 * preço viesse daqui, um `0,01` digitado no console viraria um pedido de um centavo.
 */
export const pedidoVitrineSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  nome: z.string().trim().min(1, "Informe seu nome").max(MAX_NOME, "Nome longo demais"),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= MAX_WHATSAPP, "Informe um WhatsApp válido com DDD"),
  observacao: z.string().trim().max(MAX_OBSERVACAO, "Observação longa demais").nullable(),
  /** Gerado no navegador. Duplo-toque em "Finalizar" ou retry de rede não vira dois pedidos. */
  idempotencia: z.string().uuid(),
  /** Forma escolhida no checkout (0051); a RPC confere se o catálogo aceita. */
  forma_pagamento: z.string().trim().max(40).nullable().optional(),
  /** Tudo abaixo é opcional: o pedido sai mesmo sem e-mail e sem endereço. */
  email: z
    .string()
    .trim()
    .max(200, "E-mail longo demais")
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  cep: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, "CEP inválido")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  logradouro: z.string().trim().max(120).nullable().default(null),
  numero: z.string().trim().max(20).nullable().default(null),
  bairro: z.string().trim().max(120).nullable().default(null),
  cidade: z.string().trim().max(120).nullable().default(null),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "UF inválida")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  itens: z
    .array(
      z.object({
        produto_id: z.string().uuid(),
        quantidade: z.number().int("Quantidade precisa ser inteira").min(1).max(MAX_QTD),
      }),
    )
    .min(1, "O carrinho está vazio")
    .max(MAX_ITENS, `No máximo ${MAX_ITENS} produtos diferentes por pedido`),
});

export type PedidoVitrineInput = z.infer<typeof pedidoVitrineSchema>;

/**
 * Texto do pedido para o WhatsApp.
 *
 * Generaliza o `linkComprarAgora` que estava inline em `ProdutoPopup.tsx`, que só sabia
 * falar de um produto. O número do pedido entra no texto de propósito: é o que faz a
 * mensagem no celular do dono e a linha no painel serem visivelmente a mesma coisa.
 */
export function textoPedidoVitrine(d: {
  numero: string;
  nomeCatalogo: string;
  itens: ItemCarrinhoVitrine[];
  total: number;
  nomeCliente: string;
  observacao: string | null;
  /** Endereço já em uma linha, quando o cliente informou. */
  entrega?: string | null;
  /** Forma de pagamento escolhida no checkout. */
  pagamento?: string | null;
  /**
   * Link do painel para o DONO abrir e confirmar o pedido (/vendas?pedido=P-0001). Exige
   * login: quem mais vir a mensagem só cai na tela de entrar.
   */
  linkPainel?: string | null;
}): string {
  const linhas = [
    `Olá! Fiz um pedido pelo catálogo ${d.nomeCatalogo}.`,
    "",
    `Pedido ${d.numero}`,
    ...d.itens.map((i) => `${i.quantidade}x ${i.nome} — ${formatBRL(i.preco * i.quantidade)}`),
    "",
    `Total: ${formatBRL(d.total)}`,
    `Nome: ${d.nomeCliente}`,
  ];
  if (d.pagamento?.trim()) linhas.push(`Pagamento: ${d.pagamento.trim()}`);
  if (d.entrega?.trim()) linhas.push(`Entrega: ${d.entrega.trim()}`);
  if (d.observacao?.trim()) linhas.push(`Observação: ${d.observacao.trim()}`);
  if (d.linkPainel) linhas.push("", `Confirmar no painel: ${d.linkPainel}`);
  return linhas.join("\n");
}

/**
 * Link do WhatsApp, encurtando a lista se a URL passar do teto.
 *
 * Cortar é melhor que mandar um link quebrado: o pedido completo já está gravado no painel,
 * então a mensagem só precisa avisar e identificar. O mesmo tratamento de número de
 * `lib/comprovante.ts:39-47` — sem número, o `wa.me` deixa a pessoa escolher o contato.
 */
export function linkPedidoWhatsapp(texto: string, whatsappDestino: string | null): string {
  const digitos = whatsappDestino?.replace(/\D/g, "");
  const base = digitos ? `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}` : "https://wa.me/";

  let corpo = texto;
  if (`${base}?text=${encodeURIComponent(corpo)}`.length > MAX_URL_WHATSAPP) {
    const linhas = corpo.split("\n");
    // Tira item por item do fim da lista até caber, e diz quantos ficaram de fora.
    let cortados = 0;
    while (linhas.length > 4 && `${base}?text=${encodeURIComponent(linhas.join("\n"))}`.length > MAX_URL_WHATSAPP) {
      const i = linhas.findIndex((l) => /^\d+x /.test(l));
      const ultimo = linhas.map((l) => /^\d+x /.test(l)).lastIndexOf(true);
      if (i < 0 || ultimo < 0) break;
      linhas.splice(ultimo, 1);
      cortados += 1;
    }
    if (cortados > 0) linhas.splice(linhas.map((l) => /^\d+x /.test(l)).lastIndexOf(true) + 1, 0, `+ ${cortados} item(ns) — lista completa no pedido`);
    corpo = linhas.join("\n");
  }

  return `${base}?text=${encodeURIComponent(corpo)}`;
}
