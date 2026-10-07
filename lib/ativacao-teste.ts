/**
 * Aviso de ativação no período de teste (Dashboard). Uma frase só, a mais útil para o dia
 * do teste; complementa o checklist de `components/dashboard/PrimeirosPassos.tsx` (que
 * lista tudo) em vez de repeti-lo. Puro, coberto por `ativacao-teste.test.ts`.
 */

import type { ResumoAssinatura } from "./planos";

/** Duração do teste grátis: `now() + interval '14 days'` do gatilho da 0057. */
export const DIAS_TESTE = 14;

export interface AvisoAtivacao {
  tipo: "produto" | "venda" | "fim";
  texto: string;
  href: string;
  acao: string;
  /** "fim" pede mais atenção que um empurrão de uso. */
  tom: "neutral" | "negative";
}

const DIA_MS = 86_400_000;

/**
 * Prioridade: o fim do teste (≤ 3 dias) vem primeiro, porque é o único com prazo. Depois,
 * nos dias 1–3, o primeiro produto; e, a partir daí, a primeira venda. Fora do teste (ou com
 * o teste já vencido, quando o plano efetivo deixou de ser o do teste), nada.
 */
export function avisoAtivacaoTeste(
  r: Pick<ResumoAssinatura, "status" | "teste_ate" | "plano_id" | "plano_efetivo"> | null | undefined,
  uso: { temProduto: boolean; temVenda: boolean },
  agora = new Date(),
): AvisoAtivacao | null {
  if (!r || r.status !== "teste" || !r.teste_ate || r.plano_efetivo !== r.plano_id) return null;
  const fim = new Date(r.teste_ate).getTime();
  if (!Number.isFinite(fim) || fim <= agora.getTime()) return null;

  const restantes = Math.ceil((fim - agora.getTime()) / DIA_MS);
  // Dia 1 = primeiras 24h da conta. Teste estendido pelo master (mais de 14 dias) fica no dia 1.
  const diaDoTeste = Math.max(1, DIAS_TESTE - restantes + 1);

  if (restantes <= 3) {
    return {
      tipo: "fim",
      texto: restantes <= 1 ? "Seu teste grátis acaba hoje." : `Seu teste grátis acaba em ${restantes} dias.`,
      href: "/configuracoes?aba=plano",
      acao: "Ver planos",
      tom: "negative",
    };
  }
  if (!uso.temProduto && diaDoTeste <= 3) {
    return {
      tipo: "produto",
      texto: `Dia ${diaDoTeste} do seu teste: cadastre o primeiro produto, com o custo, para o lucro sair certo.`,
      href: "/produtos",
      acao: "Cadastrar produto",
      tom: "neutral",
    };
  }
  // Depois do dia 3 sem produto, o empurrão passa a ser a venda (pedido importado da Shopee
  // ou do ML também conta, e traz o produto junto).
  if (!uso.temVenda) {
    return {
      tipo: "venda",
      texto: `Dia ${diaDoTeste} do seu teste: registre a primeira venda para ver o lucro real dela.`,
      href: "/pdv",
      acao: "Registrar venda",
      tom: "neutral",
    };
  }
  return null;
}
