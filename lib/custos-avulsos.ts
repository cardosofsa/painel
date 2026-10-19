/**
 * Custos avulsos (0112): itens com custo que não são produto. PURO, coberto por
 * `custos-avulsos.test.ts`.
 *
 * Três jeitos de entrar: um por um, colar uma lista (Notas, WhatsApp, planilha copiada) e
 * importar planilha. Os dois últimos passam por `prepararImportacao`, que compara com o que
 * já existe pelo nome e diz o que é novo, o que muda de preço e o que fica igual — a tela
 * mostra isso antes de gravar.
 */

import { lerNumero, mapearColunas, normalizarCabecalho } from "./importar";

export type UnidadeCusto = "un" | "cx" | "kg" | "l";

export const UNIDADES_CUSTO: readonly { id: UnidadeCusto; rotulo: string; curto: string }[] = [
  { id: "un", rotulo: "Unidade", curto: "un" },
  { id: "cx", rotulo: "Caixa", curto: "cx" },
  { id: "kg", rotulo: "Quilo (kg)", curto: "kg" },
  { id: "l", rotulo: "Litro (L)", curto: "L" },
];

export const unidadeCusto = (id: string | null | undefined) => UNIDADES_CUSTO.find((u) => u.id === id) ?? UNIDADES_CUSTO[0];

export interface CustoAvulso {
  id: string;
  nome: string;
  unidade: UnidadeCusto;
  custo: number;
  grupo: string | null;
  observacao: string | null;
  ativo: boolean;
  atualizado_em: string;
}

/** Uma linha lida de uma lista colada ou planilha, antes de gravar. */
export interface LinhaCusto {
  nome: string;
  unidade: UnidadeCusto;
  custo: number;
  grupo: string | null;
  observacao: string | null;
}

export const LIMITES_CUSTO = { nome: 120, grupo: 60, observacao: 500, custoMax: 1_000_000 } as const;

/** Nome para comparar: sem espaço sobrando e sem diferenciar maiúscula (o banco faz igual). */
export const chaveNome = (nome: string) => nome.replace(/\s+/g, " ").trim().toLowerCase();

/** Unidade escrita de vários jeitos: "kg", "Kg", "quilo", "L", "litro", "cx", "caixa", "un", "und". */
export function lerUnidade(texto: string | null | undefined): UnidadeCusto | null {
  const t = normalizarCabecalho(texto ?? "");
  if (!t) return null;
  if (/\b(kg|kilo|quilo|quilos|kilos)\b/.test(t)) return "kg";
  if (/\b(l|lt|litro|litros)\b/.test(t)) return "l";
  if (/\b(cx|caixa|caixas)\b/.test(t)) return "cx";
  if (/\b(un|und|unid|unidade|unidades|pc|peca|pecas)\b/.test(t)) return "un";
  return null;
}

/** Valor com cara de dinheiro no fim da linha: "24,00", "R$ 24", "48,5", "1.234,56/kg". */
const VALOR_NO_FIM = /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?)\s*(?:\/\s*([A-Za-zçÇ]+))?\s*$/;

/**
 * Lê uma lista colada. Aceita uma linha por item, com o valor no fim, separado por tab,
 * "|", ";", "-", ":" ou espaço. Linha sem valor que não é cabeçalho vira o GRUPO das
 * seguintes ("FARINHAS NATURAIS"). Cabeçalho tipo "Produto | Preço (Kg)" define a unidade do
 * bloco. Devolve as linhas lidas e as que não deu para ler, com o número da linha.
 */
export function lerListaColada(texto: string, unidadePadrao: UnidadeCusto = "un"): { linhas: LinhaCusto[]; ignoradas: { linha: number; texto: string }[] } {
  const linhas: LinhaCusto[] = [];
  const ignoradas: { linha: number; texto: string }[] = [];
  let grupo: string | null = null;
  let unidadeBloco: UnidadeCusto = unidadePadrao;

  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.replace(/ /g, " ").replace(/^[\s|•*\-–]+|[\s|]+$/g, "").trim();
    if (!linha) return;
    const norm = normalizarCabecalho(linha);
    // Cabeçalho de tabela: "Produto Preço(Kg)", "Item | Valor".
    if (/^(produto|produtos|item|itens|nome|descricao)\b/.test(norm) && /(preco|valor|custo)/.test(norm)) {
      unidadeBloco = lerUnidade(linha) ?? unidadePadrao;
      return;
    }
    const m = linha.match(VALOR_NO_FIM);
    const valor = m ? lerNumero(m[1]) : null;
    const nome = m ? linha.slice(0, m.index).replace(/(?:R\$|[\t|;:–\-=]|\.{2,})+\s*$/g, "").trim() : "";
    if (!m || valor === null || !nome) {
      // Sem valor: título de seção (vira grupo) se for curto e não tiver número solto.
      if (!/\d/.test(linha) && linha.length <= LIMITES_CUSTO.grupo) {
        grupo = linha.replace(/[:\s]+$/, "");
        unidadeBloco = lerUnidade(linha) ?? unidadeBloco;
      } else ignoradas.push({ linha: i + 1, texto: linha });
      return;
    }
    if (valor < 0 || valor > LIMITES_CUSTO.custoMax) {
      ignoradas.push({ linha: i + 1, texto: linha });
      return;
    }
    // Unidade da própria linha ("24,00/kg", "Cravo (kg) 45") vence a do bloco.
    const unidade = lerUnidade(m[2]) ?? lerUnidade(nome.match(/\(([^)]*)\)\s*$/)?.[1]) ?? unidadeBloco;
    linhas.push({ nome: nome.slice(0, LIMITES_CUSTO.nome), unidade, custo: valor, grupo, observacao: null });
  });
  return { linhas, ignoradas };
}

/** Apelidos das colunas aceitas na planilha (cabeçalho tolerante a acento e caixa). */
export const COLUNAS_PLANILHA = {
  nome: ["nome", "produto", "item", "descricao", "insumo"],
  custo: ["custo", "preco", "valor", "preco kg", "preco un", "custo kg", "custo unitario", "preco unitario", "valor unitario"],
  unidade: ["unidade", "un", "medida", "unid"],
  grupo: ["grupo", "categoria", "secao", "tipo"],
  observacao: ["observacao", "obs", "observacoes", "nota", "marca"],
} as const;

/**
 * Planilha (CSV ou .xlsx, já lida em matriz pela `lerPlanilha`). A primeira linha é o
 * cabeçalho. Sem coluna de unidade, a unidade sai do cabeçalho do custo ("Preço (Kg)").
 */
export function lerPlanilhaCustos(matriz: string[][], unidadePadrao: UnidadeCusto = "un"): { linhas: LinhaCusto[]; ignoradas: { linha: number; texto: string }[]; erro: string | null } {
  if (matriz.length < 2) return { linhas: [], ignoradas: [], erro: "A planilha precisa de um cabeçalho e pelo menos uma linha." };
  const { linhas: brutas, faltando } = mapearColunas(matriz, COLUNAS_PLANILHA, ["nome", "custo"]);
  if (faltando.length) return { linhas: [], ignoradas: [], erro: "Não achei as colunas de nome e de custo. Use cabeçalhos como “Produto” e “Preço”." };
  const colunaCusto = matriz[0].find((h) => /^(custo|preco|valor)/.test(normalizarCabecalho(h)));
  const unidadeDoCabecalho = lerUnidade(colunaCusto) ?? unidadePadrao;
  const linhas: LinhaCusto[] = [];
  const ignoradas: { linha: number; texto: string }[] = [];
  for (const b of brutas) {
    const nome = (b.nome ?? "").replace(/\s+/g, " ").trim();
    const custo = lerNumero(b.custo);
    if (!nome && custo === null) continue;
    if (!nome || custo === null || custo < 0 || custo > LIMITES_CUSTO.custoMax) {
      ignoradas.push({ linha: b.__linha, texto: [b.nome, b.custo].filter(Boolean).join(" · ") });
      continue;
    }
    linhas.push({
      nome: nome.slice(0, LIMITES_CUSTO.nome),
      unidade: lerUnidade(b.unidade) ?? unidadeDoCabecalho,
      custo,
      grupo: b.grupo ? b.grupo.slice(0, LIMITES_CUSTO.grupo) : null,
      observacao: b.observacao ? b.observacao.slice(0, LIMITES_CUSTO.observacao) : null,
    });
  }
  return { linhas, ignoradas, erro: null };
}

export type SituacaoImportacao = "novo" | "muda" | "igual";

export interface ItemImportacao extends LinhaCusto {
  situacao: SituacaoImportacao;
  /** Custo atual, quando o nome já existe. */
  custoAtual: number | null;
}

/**
 * Compara a lista lida com os custos que já existem (pelo nome). Nome repetido na própria
 * lista: vale a última ocorrência (é a que a pessoa leu por último).
 */
export function prepararImportacao(lidas: LinhaCusto[], existentes: Pick<CustoAvulso, "nome" | "custo" | "unidade">[]): ItemImportacao[] {
  const atuais = new Map(existentes.map((e) => [chaveNome(e.nome), e]));
  const unicas = new Map<string, LinhaCusto>();
  for (const l of lidas) unicas.set(chaveNome(l.nome), l);
  return [...unicas.values()].map((l) => {
    const atual = atuais.get(chaveNome(l.nome));
    if (!atual) return { ...l, situacao: "novo", custoAtual: null };
    const igual = Math.abs(Number(atual.custo) - l.custo) < 0.00005 && atual.unidade === l.unidade;
    return { ...l, situacao: igual ? "igual" : "muda", custoAtual: Number(atual.custo) };
  });
}

/**
 * O custo de uma quantidade do item, na unidade em que ele foi cadastrado: 0,1 kg de um item
 * de R$ 24/kg = R$ 2,40. Arredonda em centavos.
 */
export function custoDaQuantidade(custo: number, quantidade: number): number {
  if (!Number.isFinite(custo) || !Number.isFinite(quantidade) || quantidade <= 0) return 0;
  return Math.round(custo * quantidade * 100) / 100;
}
