/**
 * NF-e pela FOTO do DANFE (Fase 5, onda C): a IA lê a nota impressa e devolve o mesmo
 * formato do XML (`NfeCompra`), para seguir o fluxo de importação de sempre. Puro, coberto
 * por `prompts-nfe-foto.test.ts`. Foto lê errado às vezes: a tela pede conferência.
 */

import type { ItemNfe, NfeCompra } from "@/lib/compras-nfe";
import { hashTexto, lerObjetoJson } from "./texto";

export function montarPromptNfeFoto(): string {
  return [
    "Você lê a FOTO de um DANFE (nota fiscal eletrônica de compra, do Brasil) e transcreve os dados, sem inventar.",
    "Devolva JSON com:",
    '- "numero": número da NF (só dígitos) e "serie" (ou null);',
    '- "emissao": data de emissão em AAAA-MM-DD (ou null);',
    '- "chave": a chave de acesso de 44 dígitos, só os dígitos (ou null se não der para ler TODOS);',
    '- "emitente": {"nome", "cnpj"} de quem VENDEU (o emitente, no topo da nota);',
    '- "itens": cada linha da tabela de produtos: {"codigo", "descricao", "quantidade", "valor_unitario", "valor_total"} — números com ponto decimal;',
    '- "frete": valor do frete (0 se não houver) e "total": valor total da nota.',
    "Não some nem arredonde por conta própria: copie os valores impressos. Campo ilegível = null (ou 0 nos valores).",
    "Se a foto não for de uma nota fiscal, devolva itens vazio.",
  ].join("\n");
}

export function esquemaNfeFoto(): object {
  return {
    type: "object",
    properties: {
      numero: { type: ["string", "null"] },
      serie: { type: ["string", "null"] },
      emissao: { type: ["string", "null"] },
      chave: { type: ["string", "null"] },
      emitente: { type: "object", properties: { nome: { type: "string" }, cnpj: { type: ["string", "null"] } }, required: ["nome", "cnpj"] },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            codigo: { type: "string" },
            descricao: { type: "string" },
            quantidade: { type: "number" },
            valor_unitario: { type: "number" },
            valor_total: { type: "number" },
          },
          required: ["codigo", "descricao", "quantidade", "valor_unitario", "valor_total"],
        },
      },
      frete: { type: "number" },
      total: { type: "number" },
    },
    required: ["numero", "serie", "emissao", "chave", "emitente", "itens", "frete", "total"],
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n =
    typeof v === "number"
      ? v
      : Number(
          String(v ?? "")
            .replace(/\./g, "")
            .replace(",", "."),
        );
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Resposta da IA → `NfeCompra` saneada. Item sem descrição ou quantidade cai fora. */
export function interpretarNfeFoto(bruto: string): NfeCompra {
  const o = lerObjetoJson(bruto) ?? {};
  const itens: ItemNfe[] = [];
  for (const x of Array.isArray(o.itens) ? o.itens : []) {
    const i = (x ?? {}) as Record<string, unknown>;
    const descricao = txt(i.descricao, 200);
    const quantidade = num(i.quantidade);
    if (!descricao || quantidade <= 0) continue;
    const valorTotal = num(i.valor_total);
    const valorUnitario = num(i.valor_unitario) || (valorTotal ? valorTotal / quantidade : 0);
    // Total da linha manda (vem impresso já com o desconto); sem ele, o unitário.
    const custoUnitario = r2(valorTotal > 0 ? valorTotal / quantidade : valorUnitario);
    itens.push({
      codigo: txt(i.codigo, 60) || descricao.slice(0, 20),
      ean: null,
      descricao,
      ncm: null,
      unidade: null,
      quantidade,
      valorUnitario: r2(valorUnitario),
      valorTotal: r2(valorTotal || valorUnitario * quantidade),
      custoUnitario,
    });
    if (itens.length >= 200) break;
  }
  const chave = typeof o.chave === "string" ? o.chave.replace(/\D/g, "") : "";
  const emissao = typeof o.emissao === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.emissao.trim()) ? o.emissao.trim() : null;
  const emitente = (o.emitente ?? {}) as Record<string, unknown>;
  const cnpj = typeof emitente.cnpj === "string" ? emitente.cnpj.replace(/\D/g, "") : "";
  return {
    chave: chave.length === 44 ? chave : null,
    numero: txt(o.numero, 20).replace(/\D/g, "") || "s/n",
    serie: txt(o.serie, 5) || null,
    emissao,
    emitente: { nome: txt(emitente.nome, 200) || "Fornecedor da nota", cnpj: cnpj.length === 14 ? cnpj : null },
    itens,
    frete: r2(num(o.frete)),
    total: r2(num(o.total)),
    // Duplicatas não aparecem com segurança na foto: a tela pergunta como foi pago.
    duplicatas: [],
  };
}

/** Cache por imagem: a mesma foto não paga duas vezes. */
export function hashNfeFoto(hashImagem: string): string {
  return hashTexto(`nfe-foto-v1\u0001${hashImagem}`);
}
