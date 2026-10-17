/**
 * Prompt da CAPA, montado por regra, sem IA: custo zero e sempre reproduzível. PURO, coberto por
 * `prompt-capa.test.ts`.
 *
 * Dois modos:
 *  - `montarPromptCapaCena`: o que vai ao modelo de imagem do Painel. Pede só a CENA e o
 *    produto, sem nenhuma letra: título, selos, faixa e logo são desenhados depois por código
 *    (`lib/imagem/layout.ts`), porque modelo de imagem erra acento e deforma logo.
 *  - `montarPromptCapaCompleta`: para o usuário copiar e usar em OUTRO gerador, que desenha o
 *    texto. Traz título, selos e faixa escritos como a ficha pede.
 */

import { fichaParaPrompt, ROTULO_POSICAO_LOGO, type FichaMarca } from "./ficha";

export interface ContextoCapa {
  produtoNome: string;
  variante: string | null;
  /** O título que aparecerá na capa (já aprovado pelo usuário). */
  titulo: string;
  ficha: FichaMarca;
  /** Memória ativa da loja (preferências e regras). */
  memoria: string[];
  /** A plataforma exige fundo branco na primeira imagem. */
  capaFundoBranco: boolean;
  /** Há foto do produto para a IA usar como referência. */
  temFotoReferencia: boolean;
  /** Texto da faixa inferior, se o usuário quiser texto nela. */
  textoFaixa: string | null;
}

const lista = (itens: string[]) => itens.map((i) => `- ${i}`).join("\n");

function blocosComuns(c: ContextoCapa): string[] {
  const f = c.ficha;
  const partes: string[] = [];
  partes.push(
    c.capaFundoBranco
      ? "Fundo branco puro (a plataforma costuma exigir fundo branco na primeira imagem)."
      : f.fundo
        ? `Fundo: ${f.fundo}.`
        : "Fundo limpo e neutro, sem poluição visual.",
  );
  if (f.luz) partes.push(`Luz: ${f.luz}.`);
  partes.push(f.enquadramento ? `Enquadramento: ${f.enquadramento}.` : "Produto centralizado, nítido, em foco.");
  partes.push(`O produto ocupa pelo menos ${f.areaProdutoMinPct ?? 40}% da imagem, com muito espaço de respiro.`);
  if (f.paleta?.length) partes.push(`Cores de apoio (use com moderação): ${f.paleta.join(", ")}.`);
  partes.push(
    f.pessoas === "sim"
      ? "Pode haver uma pessoa adulta fictícia, fotorrealista, em cena discreta, sem esconder o produto."
      : "Sem pessoas na imagem.",
  );
  if (f.proibicoes?.length) partes.push(`Nunca inclua:\n${lista(f.proibicoes)}`);
  if (c.memoria.length) partes.push(`Preferências da loja (siga):\n${lista(c.memoria.slice(0, 12))}`);
  return partes;
}

const nomeCompleto = (c: ContextoCapa) => [c.produtoNome, c.variante].filter(Boolean).join(" — ");

/** Prompt para o modelo de imagem do Painel: só a cena, com espaço livre para o texto desenhado depois. */
export function montarPromptCapaCena(c: ContextoCapa): string {
  return [
    `Fotografia de produto quadrada (1:1) para a capa de um anúncio de marketplace: ${nomeCompleto(c)}.`,
    c.temFotoReferencia
      ? "Use a foto enviada como referência do produto: mantenha o produto, a embalagem, as cores e os rótulos exatamente como são. Não altere nem invente nada nele."
      : "Mostre o produto de forma fiel ao nome informado, sem inventar detalhes.",
    ...blocosComuns(c),
    "Deixe livre (sem objetos importantes) cerca de 25% do topo da imagem, para o título que será colocado depois, e cerca de 12% da base, para uma faixa.",
    "NÃO escreva nenhuma letra, número, palavra, logotipo, marca d'água, selo, etiqueta de preço nem moldura. A imagem não tem texto nenhum.",
  ].join("\n");
}

/** Prompt para copiar e usar em outro gerador que desenha o texto. */
export function montarPromptCapaCompleta(c: ContextoCapa): string {
  const f = c.ficha;
  const texto: string[] = [`Título (exatamente assim, com acentos corretos): "${c.titulo}".`];
  if (f.tipografia) texto.push(`Tipografia do título: ${f.tipografia}.`);
  if (f.selos?.length) texto.push(`Selos de diferenciais, em linha, curtos: ${f.selos.map((s) => `"${s}"`).join(", ")}.`);
  if (f.faixaInferior || c.textoFaixa) texto.push(`Faixa inferior: ${f.faixaInferior ?? "faixa lisa"}${c.textoFaixa ? `, com o texto "${c.textoFaixa}"` : ""}.`);
  if (f.logoPosicao && f.logoPosicao !== "nenhuma") texto.push(`Logo da loja (arquivo oficial, sem redesenhar): ${ROTULO_POSICAO_LOGO[f.logoPosicao].toLowerCase()}, com ${f.logoLarguraPct ?? 10}% da largura da imagem.`);
  return [
    `Crie a capa quadrada (1:1, 1024 x 1024 px) de um anúncio de marketplace: ${nomeCompleto(c)}.`,
    c.temFotoReferencia ? "Use a foto do produto enviada como referência e não altere o produto, a embalagem nem o rótulo." : "",
    ...blocosComuns(c),
    "",
    "Texto na imagem:",
    ...texto,
    "Revise cada palavra: ortografia e acentos do português do Brasil precisam estar corretos. Sem preço, promoção, frete, estrelas, selos de avaliação, contato ou QR code.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

/** O resumo da ficha como o usuário a vê antes de gastar. */
export function resumoDaFicha(ficha: FichaMarca): string {
  return fichaParaPrompt(ficha, "capa_1");
}
