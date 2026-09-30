/**
 * Formata o `detalhes` jsonb de `historico_admin` em linhas legíveis para a tela.
 *
 * Fica em `lib/` (não dentro do componente) porque precisa ser testável isolado — mesmo
 * padrão de `lib/format.ts`/`lib/acesso.ts`: a lógica de diff é fácil de acertar errado
 * silenciosamente (campo que não mudou aparecendo como "mudou de X para X", ou array vazio
 * lido como "nada mudou" quando na verdade zerou uma lista que tinha itens).
 */

import type { AbaId } from "./acesso";

export interface CampoAlterado {
  de: unknown;
  para: unknown;
  // Só o registro `ia_teste` (0036) tem sub-campos: cada um é um par de/para próprio.
  dias?: CampoAlterado;
  limite?: CampoAlterado;
  reiniciado?: boolean;
}

export type DetalhesHistorico = Record<string, CampoAlterado>;

const ROTULOS: Record<AbaId, string> = {
  dashboard: "Dashboard",
  pdv: "PDV",
  vendas: "Vendas",
  precificacao: "Precificação",
  produtos: "Produtos",
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  compras: "Compras",
  estoque: "Estoque",
  financeiro: "Financeiro",
  catalogo: "Catálogo",
  vixe: "Vixe Alertas",
  configuracoes: "Configurações",
};

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  suspenso: "Suspenso",
};

function rotuloAba(id: string): string {
  return ROTULOS[id as AbaId] ?? id;
}

function diffAbas(de: unknown, para: unknown): string {
  const antes = Array.isArray(de) ? (de as string[]) : [];
  const depois = Array.isArray(para) ? (para as string[]) : [];
  const liberadas = depois.filter((a) => !antes.includes(a)).map(rotuloAba);
  const removidas = antes.filter((a) => !depois.includes(a)).map(rotuloAba);

  const partes: string[] = [];
  if (liberadas.length > 0) partes.push(`liberou ${liberadas.join(", ")}`);
  if (removidas.length > 0) partes.push(`removeu ${removidas.join(", ")}`);
  // Mesmo conjunto de ids em ordem diferente — não é uma mudança de verdade para o usuário.
  if (partes.length === 0) return "";
  return `Abas: ${partes.join(" — ")}`;
}

function formatarData(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "sem data";
  return String(valor).slice(0, 10).split("-").reverse().join("/");
}

/** Campos pelos quais a tabela de contas do `/admin` pode ser ordenada. */
export interface ContaOrdenavel {
  criado_em: string;
  ultimo_acesso: string | null;
  total_produtos: number;
  total_vendas: number;
  faturamento_total: number;
}

export type CampoOrdenacaoConta = keyof ContaOrdenavel;

/**
 * Ordena uma lista de contas por um dos campos numéricos/data, sem mutar o array recebido.
 * Fica em `lib/` (não inline no componente) porque a regra do `null` — "nunca acessou" vai
 * sempre para o fim, não para o topo mesmo em ordem crescente — é fácil de acertar errado
 * silenciosamente, e testável isolada.
 */
export function ordenarContas<T extends ContaOrdenavel>(
  contas: T[],
  campo: CampoOrdenacaoConta,
  direcao: "asc" | "desc",
): T[] {
  const copia = [...contas];
  copia.sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return direcao === "asc" ? -1 : 1;
    if (va > vb) return direcao === "asc" ? 1 : -1;
    return 0;
  });
  return copia;
}

/** Devolve uma linha por campo que de fato mudou. Diff vazio devolve lista vazia. */
export function formatarDiffHistorico(detalhes: DetalhesHistorico | null | undefined): string[] {
  if (!detalhes) return [];
  const linhas: string[] = [];

  if (detalhes.status) {
    const de = ROTULO_STATUS[String(detalhes.status.de)] ?? String(detalhes.status.de);
    const para = ROTULO_STATUS[String(detalhes.status.para)] ?? String(detalhes.status.para);
    linhas.push(`Status: ${de} → ${para}`);
  }

  if (detalhes.abas) {
    const linha = diffAbas(detalhes.abas.de, detalhes.abas.para);
    if (linha) linhas.push(linha);
  }

  if (detalhes.expira_em) {
    linhas.push(`Vencimento: ${formatarData(detalhes.expira_em.de)} → ${formatarData(detalhes.expira_em.para)}`);
  }

  if (detalhes.observacao) {
    const de = detalhes.observacao.de ? String(detalhes.observacao.de) : "(vazia)";
    const para = detalhes.observacao.para ? String(detalhes.observacao.para) : "(vazia)";
    linhas.push(`Observação: "${de}" → "${para}"`);
  }

  // Gravado por `admin_definir_limite_ia` (migração 0024). Sem este bloco a mudança de
  // cota apareceria como linha vazia no histórico.
  if (detalhes.ia_limite_diario) {
    const rotular = (v: unknown) => (Number(v) === 0 ? "desligada" : `${v}/dia`);
    linhas.push(`Cota de IA: ${rotular(detalhes.ia_limite_diario.de)} → ${rotular(detalhes.ia_limite_diario.para)}`);
  }

  // Gravado por `admin_definir_teste_ia` (migração 0036).
  if (detalhes.ia_teste) {
    const t = detalhes.ia_teste as {
      dias?: { de: unknown; para: unknown };
      limite?: { de: unknown; para: unknown };
      reiniciado?: boolean;
    };
    const partes: string[] = [];
    if (t.limite && t.limite.de !== t.limite.para) partes.push(`${t.limite.de} → ${t.limite.para} gerações`);
    if (t.dias && t.dias.de !== t.dias.para) partes.push(`${t.dias.de} → ${t.dias.para} dias`);
    if (t.reiniciado) partes.push("reiniciado");
    linhas.push(`Teste da IA: ${partes.join(", ") || "sem mudança"}`);
  }

  return linhas;
}
