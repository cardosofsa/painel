/**
 * Estúdio de IA (Fase 2): os tipos de imagem de produto e o prompt de cada um, para o
 * modelo de imagem do Gemini ("Nano Banana"). Puro, coberto por `prompts-imagem.test.ts`.
 *
 * Regra que vale para todos: a IA EDITA a foto real do produto, não inventa outro. Sem
 * foto, só os tipos que não dependem dela. Nada de texto inventado sobre o produto
 * (medida, material, garantia) além do que a pessoa escreveu.
 */

export type TipoImagem = "fundo_branco" | "ambiente" | "capa_selo" | "variacao_cor" | "medidas" | "livre";

export interface DefinicaoImagem {
  rotulo: string;
  descricao: string;
  /** Precisa de uma foto do produto como base. */
  precisaFoto: boolean;
  /** Campo extra que o tipo pede. */
  campo?: { nome: "selo" | "cor" | "medidas" | "cena" | "pedido"; rotulo: string; exemplo: string; obrigatorio: boolean };
}

export const TIPOS_IMAGEM: Record<TipoImagem, DefinicaoImagem> = {
  fundo_branco: { rotulo: "Fundo branco (capa)", descricao: "A foto do celular vira foto de catálogo: fundo branco puro, luz de estúdio, produto centralizado.", precisaFoto: true },
  ambiente: {
    rotulo: "Foto de ambiente",
    descricao: "O produto em uso, num cenário que combina com ele.",
    precisaFoto: true,
    campo: { nome: "cena", rotulo: "Cenário (opcional)", exemplo: "mesa de café da manhã, luz natural", obrigatorio: false },
  },
  capa_selo: {
    rotulo: "Capa com selo",
    descricao: "Foto de capa com um selo de destaque (frete grátis, kit, lançamento).",
    precisaFoto: true,
    campo: { nome: "selo", rotulo: "Texto do selo", exemplo: "Kit com 2", obrigatorio: true },
  },
  variacao_cor: {
    rotulo: "Outra cor",
    descricao: "O mesmo produto em outra cor, mantendo formato e detalhes.",
    precisaFoto: true,
    campo: { nome: "cor", rotulo: "Cor", exemplo: "azul-marinho", obrigatorio: true },
  },
  medidas: {
    rotulo: "Medidas",
    descricao: "Imagem com as medidas indicadas por setas, para tirar dúvida do comprador.",
    precisaFoto: true,
    campo: { nome: "medidas", rotulo: "Medidas", exemplo: "Altura 9,5 cm · Diâmetro 8 cm · 325 ml", obrigatorio: true },
  },
  livre: {
    rotulo: "Pedido livre",
    descricao: "Descreva o que quer na imagem.",
    precisaFoto: false,
    campo: { nome: "pedido", rotulo: "O que a imagem deve mostrar", exemplo: "o produto sobre uma bancada de madeira com plantas", obrigatorio: true },
  },
};

export const TIPOS_IMAGEM_LISTA = Object.keys(TIPOS_IMAGEM) as TipoImagem[];

export interface ContextoImagem {
  produtoNome: string;
  /** O texto do campo extra do tipo (selo, cor, medidas, cena, pedido). */
  extra?: string | null;
  temFoto: boolean;
}

const BASE =
  "Imagem para anúncio de marketplace brasileiro (Shopee, Mercado Livre), formato quadrado 1:1, alta resolução, aparência profissional e realista. " +
  "Não adicione logotipos, marcas d'água nem marcas que não estejam na foto. Não invente texto.";

/** Texto do usuário vai entre aspas e sem quebra de linha: ele descreve, não manda no prompt. */
function limpar(s: string | null | undefined, max = 120): string {
  return (s ?? "").replace(/[\r\n"]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Erro em pt-BR (string) ou o prompt pronto. */
export function montarPromptImagem(tipo: TipoImagem, c: ContextoImagem): { prompt: string } | { erro: string } {
  const def = TIPOS_IMAGEM[tipo];
  const extra = limpar(c.extra);
  const nome = limpar(c.produtoNome, 80) || "o produto";
  if (def.precisaFoto && !c.temFoto) return { erro: "Este tipo de imagem precisa de uma foto do produto. Adicione uma foto primeiro." };
  if (def.campo?.obrigatorio && !extra) return { erro: `Preencha "${def.campo.rotulo}".` };

  const fiel = `Use a foto enviada como referência exata do produto "${nome}": mantenha formato, proporções, cores, estampas e detalhes. Não troque o produto por outro.`;
  switch (tipo) {
    case "fundo_branco":
      return { prompt: `${fiel} Recorte o produto e coloque sobre fundo branco puro (#FFFFFF), luz de estúdio suave, sombra leve embaixo, produto centralizado ocupando cerca de 80% da imagem. ${BASE}` };
    case "ambiente":
      return { prompt: `${fiel} Mostre o produto em uso num ambiente realista${extra ? ` ("${extra}")` : " que combine com ele"}, iluminação natural, foco no produto, fundo levemente desfocado. ${BASE}` };
    case "capa_selo":
      return { prompt: `${fiel} Foto de capa com fundo limpo e um selo de destaque no canto superior com exatamente este texto em português: "${extra}". O selo deve ser legível, com cores que contrastem, sem cobrir o produto. Nenhum outro texto. Imagem quadrada 1:1, alta resolução, sem marcas d'água.` };
    case "variacao_cor":
      return { prompt: `${fiel} Mude SOMENTE a cor principal do produto para "${extra}", mantendo textura, brilho, sombras e todos os outros detalhes. Fundo branco. ${BASE}` };
    case "medidas":
      return { prompt: `${fiel} Fundo branco, produto centralizado, com setas e linhas finas indicando as medidas, e os textos exatamente assim: "${extra}". Estilo de infográfico limpo, fonte legível. Nenhum outro texto. Imagem quadrada 1:1, alta resolução.` };
    case "livre":
      return { prompt: `${c.temFoto ? `${fiel} ` : `Produto: "${nome}". `}Pedido: "${extra}". ${BASE}` };
  }
}
