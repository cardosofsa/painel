import "server-only";
import { registrarErroApp } from "@/lib/erros-app";

/**
 * Falhas dos crons (sincronização dos marketplaces e backup) no `erros_app` (0076), para
 * aparecerem no Admin → Erros. Antes elas só iam no JSON da resposta, que ninguém lê.
 *
 * Mensagem curta e sem dado de conta: nada de user_id, loja_id, e-mail ou nome — só o que
 * falhou e o erro (que ainda passa por `limparMensagemErro`). Código de SERVIDOR.
 */

/** Acima disto, o resto vira uma linha de resumo: a RPC aceita 60/min NO TOTAL, e uma API fora do ar não pode apagar os outros erros do minuto. */
export const MAXIMO_FALHAS_POR_EXECUCAO = 10;

/** Monta as mensagens a registrar: uma por falha, cortada, até o máximo; o excedente numa só. */
export function mensagensDeFalhaCron(prefixo: string, falhas: readonly string[], maximo = MAXIMO_FALHAS_POR_EXECUCAO): string[] {
  const limpas = falhas.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean);
  const teto = Math.max(1, Math.floor(maximo));
  const mensagens = limpas.slice(0, teto).map((f) => `${prefixo}: ${f.slice(0, 240)}`);
  const resto = limpas.length - mensagens.length;
  if (resto > 0) mensagens.push(`${prefixo}: mais ${resto} ${resto === 1 ? "falha" : "falhas"} nesta execução.`);
  return mensagens;
}

/** Registra as falhas de uma execução do cron. Nunca lança (o `registrarErroApp` também não). */
export async function registrarFalhasCron(rota: string, prefixo: string, falhas: readonly string[]): Promise<void> {
  const mensagens = mensagensDeFalhaCron(prefixo, falhas);
  if (!mensagens.length) return;
  await Promise.all(mensagens.map((mensagem) => registrarErroApp({ onde: "servidor", rota, mensagem })));
}
