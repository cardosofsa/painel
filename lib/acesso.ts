/**
 * Catálogo de abas do sistema e as regras de quem enxerga o quê.
 *
 * Fica separado de `components/layout/navigation.ts` (que carrega ícones do lucide) porque
 * o middleware roda no Edge e precisa dessa lista sem arrastar componentes de UI junto.
 *
 * A liberação por aba é decidida pela conta master e gravada em `perfis_acesso.abas`.
 * Esconder o item do menu NÃO é controle de acesso — quem souber a URL entra do mesmo
 * jeito. Por isso a checagem de verdade acontece no middleware (`lib/supabase/middleware.ts`),
 * antes da página renderizar.
 */

export const ABAS = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "pdv", label: "PDV", href: "/pdv" },
  { id: "vendas", label: "Vendas", href: "/vendas" },
  { id: "precificacao", label: "Precificação", href: "/precificacao" },
  { id: "produtos", label: "Produtos", href: "/produtos" },
  { id: "clientes", label: "Clientes", href: "/clientes" },
  { id: "fornecedores", label: "Fornecedores", href: "/fornecedores" },
  { id: "compras", label: "Compras", href: "/compras" },
  { id: "estoque", label: "Estoque", href: "/estoque" },
  { id: "financeiro", label: "Financeiro", href: "/financeiro" },
  { id: "catalogo", label: "Catálogo", href: "/catalogo" },
  { id: "vixe", label: "Vixe", href: "/vixe" },
  { id: "configuracoes", label: "Configurações", href: "/configuracoes" },
] as const;

export type AbaId = (typeof ABAS)[number]["id"];

export const TODAS_AS_ABAS: AbaId[] = ABAS.map((a) => a.id);

/**
 * Abas que não podem ser tiradas de ninguém: `/dashboard` é pra onde o login cai (sem ela a
 * conta entra e não tem onde parar) e `/configuracoes` é onde se cadastra conta bancária e
 * categoria, sem as quais quase nada do resto funciona.
 */
export const ABAS_OBRIGATORIAS: AbaId[] = ["dashboard", "configuracoes"];

/** O que uma conta nova recebe ao ser aprovada — o mínimo pra operar, o resto o master libera. */
export const ABAS_PADRAO: AbaId[] = ["dashboard", "pdv", "produtos", "estoque", "vixe", "configuracoes"];

/** Rotas de dentro do painel que não pertencem a nenhuma aba (o painel master tem regra própria). */
const ROTAS_LIVRES = ["/admin"];

/** Qual aba responde por uma rota. Devolve null pra rota que não é de aba nenhuma. */
export function abaDaRota(pathname: string): AbaId | null {
  const aba = ABAS.find((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
  return aba ? aba.id : null;
}

export function rotaEhLivre(pathname: string): boolean {
  return ROTAS_LIVRES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Garante as obrigatórias e joga fora id inválido que por acaso tenha entrado no banco. */
export function normalizarAbas(abas: string[]): AbaId[] {
  const validas = abas.filter((a): a is AbaId => TODAS_AS_ABAS.includes(a as AbaId));
  return TODAS_AS_ABAS.filter((a) => validas.includes(a) || ABAS_OBRIGATORIAS.includes(a));
}

export function podeAcessarRota(abas: string[], pathname: string): boolean {
  if (rotaEhLivre(pathname)) return true;
  const aba = abaDaRota(pathname);
  if (!aba) return true;
  return normalizarAbas(abas).includes(aba);
}

export type StatusConta = "pendente" | "ativo" | "suspenso";

export interface PerfilAcesso {
  user_id: string;
  email: string;
  papel: "master" | "usuario";
  status: StatusConta;
  abas: string[];
  expira_em: string | null;
}

/**
 * Conta expirada vale como suspensa: o master define uma data e o acesso cai sozinho.
 * `agora` é explícito porque a tela de administração renderiza no servidor e no cliente —
 * ler o relógio durante o render daria resultados diferentes nos dois lados.
 */
export function acessoExpirado(expiraEm: string | null, agora = Date.now()): boolean {
  if (!expiraEm) return false;
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  return new Date(`${expiraEm}T23:59:59`) < hoje;
}

export function contaLiberada(perfil: Pick<PerfilAcesso, "status" | "expira_em">, agora = Date.now()): boolean {
  return perfil.status === "ativo" && !acessoExpirado(perfil.expira_em, agora);
}
