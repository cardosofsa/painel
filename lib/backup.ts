/**
 * Backup da conta (Configurações → Dados e cron semanal, Fase 5 onda D). Código de SERVIDOR.
 *
 * Duas formas de ler, mesma lista de tabelas:
 * - pela sessão do usuário (RLS garante que só vem a conta dele): botão "Baixar backup";
 * - pelo SERVIÇO no cron semanal (ignora RLS): por isso TODA consulta filtra `user_id`, e as
 *   duas tabelas filhas sem `user_id` vão pelos ids do pai, que já são da conta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TABELAS_BACKUP = [
  "perfil_negocio",
  "categorias",
  "fornecedores",
  "armazens",
  "produto_grupos",
  "produtos",
  "clientes",
  "canais",
  "lojas_canal",
  "faixas_comissao_canal",
  "contas",
  "formas_pagamento",
  "precificacoes",
  "pedidos_compra",
  "pedidos_compra_itens",
  "vendas",
  "venda_itens",
  "venda_parcelas",
  "contas_a_pagar_receber",
  "fornecedor_lancamentos",
  "movimentacoes_financeiras",
  "estoque_movimentacoes",
  "catalogos",
] as const;

/** Filhas sem `user_id`: a coluna que aponta para o pai e a tabela do pai. */
const FILHAS: Partial<Record<(typeof TABELAS_BACKUP)[number], { pai: "vendas" | "pedidos_compra"; coluna: string }>> = {
  venda_itens: { pai: "vendas", coluna: "venda_id" },
  pedidos_compra_itens: { pai: "pedidos_compra", coluna: "pedido_compra_id" },
};

const LIMITE = 50_000;

export interface Backup {
  geradoEm: string;
  sistema: "Sertão";
  dados: Record<string, unknown[]>;
}

/**
 * Monta o backup. `userId` null = sessão do usuário (RLS filtra); com `userId`, filtra
 * explicitamente (obrigatório no cliente de serviço). Tabela que não existe ainda (migração
 * pendente) fica de fora do arquivo.
 */
export async function montarBackup(supabase: SupabaseClient, userId: string | null): Promise<Backup> {
  const dados: Record<string, unknown[]> = {};
  const principais = TABELAS_BACKUP.filter((t) => !FILHAS[t]);
  const resultados = await Promise.all(
    principais.map((t) => {
      const q = supabase.from(t).select("*").limit(LIMITE);
      return userId ? q.eq("user_id", userId) : q;
    }),
  );
  principais.forEach((t, i) => {
    if (!resultados[i].error) dados[t] = resultados[i].data ?? [];
  });
  for (const [tabela, f] of Object.entries(FILHAS)) {
    const ids = ((dados[f!.pai] ?? []) as { id: string }[]).map((p) => p.id);
    const linhas: unknown[] = [];
    let falhou = false;
    // Lotes de 300 ids: a lista vai na URL do PostgREST.
    for (let i = 0; i < ids.length && !falhou; i += 300) {
      const r = await supabase
        .from(tabela)
        .select("*")
        .in(f!.coluna, ids.slice(i, i + 300))
        .limit(LIMITE);
      if (r.error) falhou = true;
      else linhas.push(...(r.data ?? []));
    }
    if (!falhou) dados[tabela] = linhas;
  }
  return { geradoEm: new Date().toISOString(), sistema: "Sertão", dados };
}

/** Nome do arquivo no bucket `backups` (0076): `<user_id>/<yyyy-mm-dd>.json`. */
export const caminhoBackup = (userId: string, dataIso: string) => `${userId}/${dataIso}.json`;

/** Quais arquivos apagar para ficar só com os `manter` mais recentes (nomes yyyy-mm-dd.json). */
export function backupsParaApagar(nomes: string[], manter = 4): string[] {
  return [...nomes]
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse()
    .slice(manter);
}
