/**
 * Depoimentos da página inicial. **Vazio de propósito:** só entra aqui depoimento real, com
 * autorização de quem falou. Com a lista vazia, a seção nem aparece na landing.
 */
export interface Depoimento {
  /** Nome como a pessoa autorizou aparecer (ex.: "Ana S."). */
  nome: string;
  /** Loja ou ramo (ex.: "Loja de acessórios na Shopee"). */
  negocio: string;
  texto: string;
  cidade?: string;
}

export const DEPOIMENTOS: Depoimento[] = [];
