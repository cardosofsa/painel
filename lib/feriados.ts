/**
 * Feriados do Brasil para o calendário do Dashboard e da Vixe: os nacionais (lei federal,
 * com os móveis calculados a partir da Páscoa) e os estaduais de cada UF.
 *
 * Por que importa para quem vende online: em feriado os Correios e as transportadoras não
 * coletam, o prazo de envio dos marketplaces corre igual e o banco não compensa boleto.
 * Feriado municipal (aniversário da cidade, padroeiro) varia demais para uma tabela fixa:
 * cada conta cadastra os seus no próprio calendário (0068).
 *
 * Os estaduais seguem as leis estaduais vigentes. Lei muda: se faltar ou sobrar algum,
 * o certo é corrigir aqui (e o teste correspondente). Puro, coberto por `feriados.test.ts`.
 */

import { pascoa } from "./calendario-comercial";

export type TipoFeriado = "nacional" | "estadual" | "facultativo";

export interface Feriado {
  /** yyyy-mm-dd */
  data: string;
  nome: string;
  tipo: TipoFeriado;
  /** Só nos estaduais. */
  uf?: string;
}

export const UFS: { uf: string; nome: string }[] = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

export const nomeDaUf = (uf: string): string | null => UFS.find((u) => u.uf === uf.toUpperCase())?.nome ?? null;

/**
 * Artigo do nome do estado: "da Bahia", "do Ceará", "de São Paulo" (sem artigo). Sem isso a
 * tela dizia "Feriados de Bahia" e "Feriado em Bahia".
 */
const FEMININOS = new Set(["BA", "PB"]);
const SEM_ARTIGO = new Set(["AL", "GO", "MG", "PE", "RO", "RR", "SC", "SP", "SE"]);
function artigo(uf: string): "a" | "o" | "" {
  const u = uf.toUpperCase();
  return FEMININOS.has(u) ? "a" : SEM_ARTIGO.has(u) ? "" : "o";
}
/** "da Bahia", "do Paraná", "de Minas Gerais". */
export function daUf(uf: string): string | null {
  const nome = nomeDaUf(uf);
  return nome && `d${artigo(uf) || "e"} ${nome}`;
}
/** "na Bahia", "no Paraná", "em Minas Gerais". */
export function naUf(uf: string): string | null {
  const nome = nomeDaUf(uf);
  if (!nome) return null;
  const a = artigo(uf);
  return `${a ? `n${a}` : "em"} ${nome}`;
}

/** [mês, dia, nome] — datas fixas por lei estadual. Estados sem feriado próprio além dos nacionais ficam vazios. */
const ESTADUAIS: Record<string, [number, number, string][]> = {
  AC: [
    [1, 23, "Dia do Evangélico"],
    [6, 15, "Aniversário do Acre"],
    [9, 5, "Dia da Amazônia"],
    [11, 17, "Tratado de Petrópolis"],
  ],
  AL: [
    [6, 24, "São João"],
    [6, 29, "São Pedro"],
    [9, 16, "Emancipação Política de Alagoas"],
  ],
  AP: [
    [3, 19, "Dia de São José"],
    [9, 13, "Criação do Território do Amapá"],
  ],
  AM: [[9, 5, "Elevação do Amazonas a Província"]],
  BA: [[7, 2, "Independência da Bahia"]],
  CE: [
    [3, 19, "Dia de São José"],
    [3, 25, "Data Magna do Ceará"],
  ],
  DF: [[11, 30, "Dia do Evangélico"]],
  ES: [],
  GO: [],
  MA: [[7, 28, "Adesão do Maranhão à Independência"]],
  MT: [],
  MS: [[10, 11, "Criação do Estado de Mato Grosso do Sul"]],
  MG: [],
  PA: [[8, 15, "Adesão do Pará à Independência"]],
  PB: [[8, 5, "Fundação do Estado da Paraíba"]],
  PR: [[12, 19, "Emancipação Política do Paraná"]],
  PE: [[3, 6, "Data Magna de Pernambuco"]],
  PI: [[10, 19, "Dia do Piauí"]],
  RJ: [[4, 23, "Dia de São Jorge"]],
  RN: [[10, 3, "Mártires de Cunhaú e Uruaçu"]],
  RS: [[9, 20, "Revolução Farroupilha"]],
  RO: [
    [1, 4, "Criação do Estado de Rondônia"],
    [6, 18, "Dia do Evangélico"],
  ],
  RR: [[10, 5, "Criação do Estado de Roraima"]],
  SC: [],
  SP: [[7, 9, "Revolução Constitucionalista"]],
  SE: [[7, 8, "Emancipação Política de Sergipe"]],
  TO: [
    [3, 18, "Autonomia do Tocantins"],
    [9, 8, "Nossa Senhora da Natividade"],
    [10, 5, "Criação do Estado do Tocantins"],
  ],
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fixo = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const somar = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Nacionais (e pontos facultativos que param o comércio) + os do estado, em ordem de data. */
export function feriadosDoAno(ano: number, uf: string | null): Feriado[] {
  const p = pascoa(ano);
  const lista: Feriado[] = [
    { data: fixo(ano, 1, 1), nome: "Confraternização Universal", tipo: "nacional" },
    { data: iso(somar(p, -48)), nome: "Carnaval (segunda)", tipo: "facultativo" },
    { data: iso(somar(p, -47)), nome: "Carnaval", tipo: "facultativo" },
    { data: iso(somar(p, -2)), nome: "Sexta-feira Santa", tipo: "nacional" },
    { data: fixo(ano, 4, 21), nome: "Tiradentes", tipo: "nacional" },
    { data: fixo(ano, 5, 1), nome: "Dia do Trabalho", tipo: "nacional" },
    { data: iso(somar(p, 60)), nome: "Corpus Christi", tipo: "facultativo" },
    { data: fixo(ano, 9, 7), nome: "Independência do Brasil", tipo: "nacional" },
    { data: fixo(ano, 10, 12), nome: "Nossa Senhora Aparecida", tipo: "nacional" },
    { data: fixo(ano, 11, 2), nome: "Finados", tipo: "nacional" },
    { data: fixo(ano, 11, 15), nome: "Proclamação da República", tipo: "nacional" },
    { data: fixo(ano, 11, 20), nome: "Dia da Consciência Negra", tipo: "nacional" },
    { data: fixo(ano, 12, 25), nome: "Natal", tipo: "nacional" },
  ];
  const sigla = (uf ?? "").toUpperCase();
  for (const [mes, dia, nome] of ESTADUAIS[sigla] ?? []) lista.push({ data: fixo(ano, mes, dia), nome, tipo: "estadual", uf: sigla });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}
