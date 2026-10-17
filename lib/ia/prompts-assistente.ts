/**
 * Assistente de conversa do estúdio de anúncios. Puro, coberto por `prompts-assistente.test.ts`.
 *
 * O usuário conversa sem formulário ("quero 6 imagens", "sem pessoa nas capas", "faz o título
 * mais curto"). A IA responde e PROPÕE ações de uma lista fechada; cada ação é um botão que o
 * usuário aprova. Nada caro (imagem, busca) roda sozinho, e nada é gravado sem o clique. Ação
 * fora da lista, ou com valor inválido, é descartada aqui, na leitura.
 */

import { normalizarFicha, type FichaMarca, type TipoImagemMarca } from "@/lib/marca/ficha";
import { TIPOS_IMAGEM_MARCA } from "@/lib/validacao";
import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export type AcaoProposta =
  | { tipo: "definir_numero_imagens"; n: number }
  | { tipo: "guardar_memoria"; memoria: { tipo: "preferencia" | "regra" | "aprendizado"; texto: string } }
  | { tipo: "ajustar_ficha"; tipoImagem: TipoImagemMarca; campos: FichaMarca }
  | { tipo: "gerar_titulos"; pedido: string | null }
  | { tipo: "gerar_descricao"; pedido: string | null }
  | { tipo: "gerar_capa"; modo: "prompt" | "imagem" }
  | { tipo: "pesquisar_concorrentes" };

export interface RespostaAssistente {
  resposta: string;
  acoes: AcaoProposta[];
}

export interface MensagemHistorico {
  papel: "usuario" | "ia";
  texto: string;
}

export interface ContextoAssistente {
  produtoNome: string;
  plataforma: string;
  /** Máximo de imagens por anúncio na plataforma, quando conhecido. */
  maxImagens: number | null;
  /** O que já existe no rascunho, em frases curtas. */
  estado: {
    titulo: string | null;
    numeroImagens: number | null;
    temConcorrentes: boolean;
    capasGeradas: number;
    fichaCapa1Preenchida: boolean;
  };
  memoria: string[];
  historico: MensagemHistorico[];
  mensagem: string;
}

const TIPOS_MEMORIA = ["preferencia", "regra", "aprendizado"] as const;

export function montarPromptAssistente(c: ContextoAssistente): string {
  const estado = linhas([
    ["Produto", limparCampo(c.produtoNome, 160)],
    ["Plataforma", limparCampo(c.plataforma, 40)],
    ["Máximo de imagens por anúncio na plataforma", c.maxImagens ? String(c.maxImagens) : null],
    ["Título escolhido", limparCampo(c.estado.titulo, 140) ?? "ainda não escolhido"],
    ["Quantidade de imagens combinada", c.estado.numeroImagens ? String(c.estado.numeroImagens) : "ainda não combinada"],
    ["Concorrentes pesquisados", c.estado.temConcorrentes ? "sim" : "não"],
    ["Capas já geradas", String(c.estado.capasGeradas)],
    ["Ficha da Capa 1", c.estado.fichaCapa1Preenchida ? "preenchida" : "vazia"],
  ]);
  const memoria = c.memoria
    .slice(0, 12)
    .map((m) => `- ${limparCampo(m, 160)}`)
    .join("\n");
  const historico = c.historico
    .slice(-6)
    .map((m) => `${m.papel === "usuario" ? "Lojista" : "Você"}: ${limparCampo(m.texto, 300)}`)
    .join("\n");

  return `Você é a assistente de anúncios de um pequeno vendedor brasileiro. Conversa em português simples, direto e curto, e ajuda a montar o anúncio passo a passo. O foco é o título e a capa 1, porque são o que faz o cliente clicar.

Situação do anúncio:
${estado}
${memoria ? `\nO que a loja já pediu para você lembrar:\n${memoria}\n` : ""}${historico ? `\nConversa até aqui:\n${historico}\n` : ""}
Mensagem do lojista: "${limparCampo(c.mensagem, 500)}"

Responda em JSON com:
- "resposta": sua resposta (até 500 caracteres). Se faltar informação, faça UMA pergunta curta.
- "acoes": de 0 a 4 ações que você SUGERE (o lojista aprova cada uma). Cada ação é um objeto com "tipo" e os campos dele:
  - {"tipo":"definir_numero_imagens","n":<1 a ${c.maxImagens ?? 9}>}
  - {"tipo":"guardar_memoria","tipo_memoria":"preferencia"|"regra"|"aprendizado","texto":"frase curta"}  (quando o lojista disser uma preferência que vale para os próximos anúncios)
  - {"tipo":"ajustar_ficha","tipo_imagem":"capa_1"|"capa_2"|"detalhe"|"beneficios"|"uso"|"composicao"|"faq"|"geral","campos":{...}}  (campos do visual: fundo, luz, enquadramento, areaProdutoMinPct, paleta, tipografia, tituloMaxPalavras, selos, faixaInferior, logoPosicao, logoLarguraPct, pessoas, tom, observacoes)
  - {"tipo":"gerar_titulos","pedido":"o que mudar nos títulos, ou vazio"}
  - {"tipo":"gerar_descricao","pedido":"o que mudar na descrição, ou vazio"}  (só depois de o título estar escolhido)
  - {"tipo":"gerar_capa","modo":"prompt"|"imagem"}  ("prompt" só monta o texto, sem custo; "imagem" gera a imagem e gasta a cota do mês)
  - {"tipo":"pesquisar_concorrentes"}

Regras:
- Imagem custa. Só sugira "gerar_capa" com modo "imagem" se o lojista já aprovou o título e pediu a imagem; antes disso, prefira "prompt" ou "gerar_titulos".
- Não invente fatos sobre o produto, preço, prazo nem concorrente. Não prometa resultado de venda.
- Sem emoji, sem markdown, sem HTML.`;
}

export function esquemaAssistente() {
  return {
    type: "object",
    properties: {
      resposta: { type: "string" },
      acoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string" },
            n: { type: "integer" },
            tipo_memoria: { type: "string" },
            texto: { type: "string" },
            tipo_imagem: { type: "string" },
            campos: { type: "object" },
            pedido: { type: "string" },
            modo: { type: "string" },
          },
          required: ["tipo"],
        },
      },
    },
    required: ["resposta", "acoes"],
  };
}

/** Lê a resposta e devolve só ações permitidas e válidas. Nunca lança. */
export function interpretarAssistente(bruto: string, maxImagens: number | null): RespostaAssistente {
  const obj = lerObjetoJson(bruto) ?? {};
  const resposta = typeof obj.resposta === "string" ? truncarEmPalavra(obj.resposta.replace(/\s+/g, " ").trim(), 500) : "";
  const teto = Math.min(maxImagens ?? 9, 12);
  const acoes: AcaoProposta[] = [];

  for (const a of Array.isArray(obj.acoes) ? obj.acoes : []) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    switch (r.tipo) {
      case "definir_numero_imagens": {
        const n = Number(r.n);
        if (Number.isInteger(n) && n >= 1 && n <= teto) acoes.push({ tipo: "definir_numero_imagens", n });
        break;
      }
      case "guardar_memoria": {
        const texto = typeof r.texto === "string" ? truncarEmPalavra(r.texto.replace(/\s+/g, " ").trim(), 160) : "";
        const tipo = TIPOS_MEMORIA.find((t) => t === r.tipo_memoria) ?? "preferencia";
        if (texto.length >= 3) acoes.push({ tipo: "guardar_memoria", memoria: { tipo, texto } });
        break;
      }
      case "ajustar_ficha": {
        const tipoImagem = TIPOS_IMAGEM_MARCA.find((t) => t === r.tipo_imagem);
        const campos = normalizarFicha(r.campos);
        // `numeroImagens` é decidido pela ação própria, não por ajuste de ficha.
        delete campos.numeroImagens;
        if (tipoImagem && Object.keys(campos).length > 0) acoes.push({ tipo: "ajustar_ficha", tipoImagem, campos });
        break;
      }
      case "gerar_titulos":
        acoes.push({ tipo: "gerar_titulos", pedido: typeof r.pedido === "string" && r.pedido.trim() ? truncarEmPalavra(r.pedido.replace(/\s+/g, " ").trim(), 300) : null });
        break;
      case "gerar_descricao":
        acoes.push({ tipo: "gerar_descricao", pedido: typeof r.pedido === "string" && r.pedido.trim() ? truncarEmPalavra(r.pedido.replace(/\s+/g, " ").trim(), 300) : null });
        break;
      case "gerar_capa":
        acoes.push({ tipo: "gerar_capa", modo: r.modo === "imagem" ? "imagem" : "prompt" });
        break;
      case "pesquisar_concorrentes":
        acoes.push({ tipo: "pesquisar_concorrentes" });
        break;
    }
    if (acoes.length >= 4) break;
  }
  return { resposta, acoes };
}

export const respostaVazia = (r: RespostaAssistente) => !r.resposta && r.acoes.length === 0;

export function hashAssistente(c: ContextoAssistente): string {
  return hashTexto(
    [
      "assistente-v1",
      c.produtoNome,
      c.plataforma,
      String(c.maxImagens ?? ""),
      c.estado.titulo ?? "",
      String(c.estado.numeroImagens ?? ""),
      c.estado.temConcorrentes ? "1" : "0",
      String(c.estado.capasGeradas),
      c.estado.fichaCapa1Preenchida ? "1" : "0",
      c.memoria.join("|"),
      c.historico.slice(-6).map((m) => `${m.papel}:${m.texto}`).join("|"),
      c.mensagem,
    ].join("\u0001"),
  );
}
