/**
 * Tipos compartilhados entre a grade, o carrinho e o checkout do PDV.
 *
 * A lógica pura (`montarCards`, `rotuloProduto`) mora em `lib/` para ser testável isolada
 * e entrar no relatório de cobertura; aqui ficam só os tipos de tela e o reexport, para
 * os componentes do PDV continuarem importando de um lugar só.
 */

export { rotuloProduto } from "@/lib/produtos";
export { montarCards, type ProdutoPdv, type CardPdv } from "@/lib/pdv";

export interface ItemCarrinho {
  produto_id: string;
  nome: string;
  sku: string;
  preco_unitario: number;
  quantidade: number;
  estoque_disponivel: number;
  imagem_url: string | null;
}

export interface ClientePdv {
  id: string;
  nome: string;
  whatsapp: string | null;
  permite_fiado: boolean;
}

export interface ContaPdv {
  id: string;
  nome: string;
}
