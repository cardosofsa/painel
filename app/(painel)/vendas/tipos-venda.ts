import type { StatusEnvio } from "@/lib/vendas-painel";
import type { EtapaVenda } from "@/lib/pedidos-central";

export interface VendaItem {
  produto_nome: string;
  produto_sku: string | null;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
  garantia_dias: number | null;
}

export interface Venda {
  id: string;
  numero: string;
  cliente_id: string | null;
  data_venda: string;
  cliente_nome: string | null;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  status_envio?: StatusEnvio;
  /** 0047. */
  etapa?: EtapaVenda | null;
  logistica?: string | null;
  clientes?: { cidade: string | null; uf: string | null } | null;
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  observacao: string | null;
  venda_itens: VendaItem[];
}
