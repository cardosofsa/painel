/** Pedido que chegou pela vitrine (catálogo). Carregado por `carregarPedidosVitrine`. */

export interface ItemPedidoVitrine {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unitario: number;
}

export interface PedidoVitrine {
  id: string;
  numero: string;
  catalogo_nome: string | null;
  cliente_nome: string;
  cliente_whatsapp: string;
  /** Opcionais: o comprador pode não ter informado. Sempre exibidos como TEXTO. */
  cliente_email: string | null;
  /** Cadastro ligado automaticamente na chegada do pedido (0043). */
  cliente_id?: string | null;
  entrega: string | null;
  entrega_cidade?: string | null;
  entrega_uf?: string | null;
  /** Forma de pagamento escolhida no checkout (0048); ausente antes. */
  forma_pagamento?: string | null;
  /** Frete escolhido no checkout (0055); entra como valor de entrega ao aprovar. */
  frete?: { servico: string; servicoId: number | null; valor: number; prazoDias: number | null } | null;
  observacao: string | null;
  total: number;
  status: "pendente" | "aceito" | "recusado" | "convertido";
  criado_em: string;
  venda_id: string | null;
  itens: ItemPedidoVitrine[];
}
