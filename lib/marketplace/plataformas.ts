import type { IdMarca } from "@/lib/marcas";

/**
 * Plataformas que o assistente "Conectar marketplace" (Configurações → Canais de venda)
 * oferece. Só a Shopee tem integração pronta; as outras aparecem como "em breve".
 */
export interface Plataforma {
  id: IdMarca;
  nome: string;
  disponivel: boolean;
  /** Canal criado quando a conta ainda não tem um desta plataforma. */
  canal: { nome: string; tipo_taxa: "faixas" | "fixo"; icone: string; cor: string; limite_titulo: number | null; limite_descricao: number | null };
  /** Faixas iniciais (editáveis depois em "Editar faixas"). */
  faixas: { preco_min: number; preco_max: number | null; comissao_pct: number; tarifa_fixa: number }[];
}

/** Mesmas 5 faixas que a migração 0005 semeia para contas novas. */
export const FAIXAS_SHOPEE_PADRAO: Plataforma["faixas"] = [
  { preco_min: 0, preco_max: 7.99, comissao_pct: 50, tarifa_fixa: 0 },
  { preco_min: 8, preco_max: 79.99, comissao_pct: 20, tarifa_fixa: 4 },
  { preco_min: 80, preco_max: 99.99, comissao_pct: 14, tarifa_fixa: 16 },
  { preco_min: 100, preco_max: 199.99, comissao_pct: 14, tarifa_fixa: 20 },
  { preco_min: 200, preco_max: null, comissao_pct: 14, tarifa_fixa: 26 },
];

export const PLATAFORMAS: Plataforma[] = [
  {
    id: "shopee",
    nome: "Shopee",
    disponivel: true,
    canal: { nome: "Shopee", tipo_taxa: "faixas", icone: "ShoppingBag", cor: "#EE4D2D", limite_titulo: 100, limite_descricao: 5000 },
    faixas: FAIXAS_SHOPEE_PADRAO,
  },
  { id: "mercadolivre", nome: "Mercado Livre", disponivel: false, canal: { nome: "Mercado Livre", tipo_taxa: "fixo", icone: "ShoppingCart", cor: "#FFE600", limite_titulo: 60, limite_descricao: 10000 }, faixas: [] },
  { id: "amazon", nome: "Amazon", disponivel: false, canal: { nome: "Amazon", tipo_taxa: "fixo", icone: "ShoppingCart", cor: "#FF9900", limite_titulo: 200, limite_descricao: null }, faixas: [] },
  { id: "shein", nome: "Shein", disponivel: false, canal: { nome: "Shein", tipo_taxa: "fixo", icone: "ShoppingBag", cor: "#000000", limite_titulo: null, limite_descricao: null }, faixas: [] },
  { id: "tiktok", nome: "TikTok Shop", disponivel: false, canal: { nome: "TikTok Shop", tipo_taxa: "fixo", icone: "ShoppingBag", cor: "#000000", limite_titulo: null, limite_descricao: null }, faixas: [] },
  { id: "magalu", nome: "Magalu", disponivel: false, canal: { nome: "Magalu", tipo_taxa: "fixo", icone: "ShoppingCart", cor: "#0086FF", limite_titulo: null, limite_descricao: null }, faixas: [] },
];
