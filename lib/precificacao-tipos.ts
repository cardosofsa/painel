/**
 * Tipos da tela de Precificação. Saíram de `precificacao-estado.ts` (785 linhas) para o
 * hook ficar só com estado e lógica; o hook os reexporta, então quem importa de lá segue igual.
 */

import type { ComponenteKit, Concorrente, FaixaComissao } from "@/lib/pricing";
import type { DiagnosticoPreco } from "@/lib/ia/prompts-preco";

export interface PrecificacaoHist {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  canal: string | null;
  titulo_anuncio: string | null;
  /** 0037; ausente em linhas antigas. */
  descricao_anuncio?: string | null;
  loja_id: string | null;
  componentes: ComponenteKit[] | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
  criado_em: string;
  origem: "individual" | "em_massa";
  /** 0045; ausentes antes da migração e em linhas antigas. */
  anuncio?: { tipo: "percentual" | "valor"; valor: number; margem_alvo_pct: number | null } | null;
  estrategia?: DiagnosticoPreco | null;
  imagem_url?: string | null;
  /** 0113; faixa de venda (ausente antes da migração e em linhas antigas). */
  preco_minimo?: number | string | null;
  preco_maximo?: number | string | null;
  /** 0100; ausentes antes da migração e em linhas antigas. */
  modo_calculo?: "margem" | "lucro" | "preco" | "markup" | null;
  parametro?: number | null;
}

export interface LojaOpcao {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
  /** Limites de texto do canal (0037). null = vale o teto do sistema. */
  limiteTitulo: number | null;
  limiteDescricao: number | null;
}

export interface VariacaoSalva {
  id: string;
  nome_variacao: string;
  multiplicador: number;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
}

export interface AnuncioSalvo {
  id: string;
  nome_anuncio: string;
  titulo_anuncio: string | null;
  descricao?: string | null;
  criado_em: string;
  variacoes: VariacaoSalva[];
}

export interface ProdutoOpcao {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  preco_venda: number;
  /** "Valor do produto" e insumos do cadastro (0029): `custo = custo_base + insumos`. */
  custo_base?: number | null;
  insumos?: ComponenteKit[] | null;
  /** Palavras-chave guardadas no produto (0037), reaproveitadas no título. */
  palavras_chave?: string[] | null;
  /** Foto do produto, usada na imagem compartilhada da precificação. */
  imagem_url?: string | null;
  /** Tipo da categoria (0042): insumo/embalagem aparecem primeiro na composição. */
  tipo?: "produto" | "insumo" | "embalagem" | null;
  /** Pai da variação (0084); `null` no produto pai e no produto sem variação. */
  produto_pai_id?: string | null;
  /** Faixa de margem do produto (0114), em fração; `null` sem faixa ou sem a migração. */
  margem_minima?: number | null;
  margem_maxima?: number | null;
}

/**
 * Produtos oferecidos na busca da Precificação: só o pai e o produto sem variação. A variação
 * filha continua na lista completa (custo, histórico, link `?produto=`), só não aparece para
 * escolher. A já escolhida fica, para o campo não aparecer em branco ao duplicar/retomar.
 */
export function produtosParaBusca<T extends { id: string; produto_pai_id?: string | null }>(produtos: T[], escolhido: string | null = null): T[] {
  return produtos.filter((p) => !p.produto_pai_id || p.id === escolhido);
}

export type VisaoPrecificacao = "individual" | "variacoes" | "kits" | "massa" | "faixas" | "raio-x" | "promocao";

export const VISOES_PRECIFICACAO: VisaoPrecificacao[] = ["individual", "variacoes", "kits", "massa", "faixas", "raio-x", "promocao"];

export interface PrecificacaoProps {
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
  /** Nome e logo da empresa (Dados da Empresa), no cabeçalho da imagem compartilhada. */
  empresa?: { nome: string | null; logoUrl: string | null } | null;
  /** Aba aberta ao entrar (`?visao=` vindo de um alerta da Vixe). */
  visaoInicial?: VisaoPrecificacao;
}
