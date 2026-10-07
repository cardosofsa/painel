/**
 * Health check (`/api/saude`): a parte pura, testada em `saude.test.ts`. A rota faz as
 * consultas; aqui só se decide o que elas significam e o que pode sair na resposta.
 *
 * A resposta é PÚBLICA (o monitor chama sem sessão): nada de conta, id, e-mail ou valor de
 * variável. Só booleanos de presença, se o banco respondeu e uma idade agregada.
 */

/** Variáveis sem as quais alguma parte do app para. Sai só se existem, nunca o valor. */
export const VARIAVEIS_ESSENCIAIS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "IA_CHAVE_COFRE", "SHOPEE_PARTNER_ID", "GEMINI_API_KEY"] as const;

export type VariavelEssencial = (typeof VARIAVEIS_ESSENCIAIS)[number];

/** Tempo máximo de cada consulta do health check: o monitor desiste em ~30 s, e o app não pode ficar preso. */
export const TEMPO_LIMITE_SAUDE_MS = 4_000;

/**
 * O cron roda uma vez por dia (vercel.json, 09:00 UTC) e a sincronização também acontece pelo
 * botão e pelas notificações. Mais de 26 h sem sincronizar = o cron falhou ao menos uma vez.
 */
export const SINCRONIZACAO_ATRASADA_MIN = 26 * 60;

export function variaveisPresentes(env: Record<string, string | undefined> = process.env): Record<VariavelEssencial, boolean> {
  return Object.fromEntries(VARIAVEIS_ESSENCIAIS.map((v) => [v, Boolean(env[v]?.trim())])) as Record<VariavelEssencial, boolean>;
}

/**
 * O banco respondeu? Sem erro, sim. Função inexistente (PGRST202/42883: migração ainda não
 * aplicada) também conta como resposta: quem disse que ela não existe foi o banco. Qualquer
 * outra coisa (rede, tempo esgotado, PostgREST sem conexão com o Postgres) é falha.
 */
export function bancoRespondeu(erro: { code?: string | null } | null | undefined): boolean {
  if (!erro) return true;
  return erro.code === "PGRST202" || erro.code === "42883";
}

export interface ConexaoParaSaude {
  user_id: string;
  ultima_sincronizacao: string | null;
  criado_em: string | null;
}

/**
 * Idade, em minutos, da sincronização mais antiga entre as conexões de contas ativas.
 * Conexão que nunca sincronizou conta desde que foi criada. Sem conexão ativa: null.
 */
export function idadeSincronizacaoMaisAntigaMin(conexoes: readonly ConexaoParaSaude[], contasAtivas: ReadonlySet<string>, agoraMs: number): number | null {
  let maisAntiga: number | null = null;
  for (const c of conexoes) {
    if (!contasAtivas.has(c.user_id)) continue;
    const t = new Date(c.ultima_sincronizacao ?? c.criado_em ?? "").getTime();
    if (!Number.isFinite(t)) continue;
    if (maisAntiga === null || t < maisAntiga) maisAntiga = t;
  }
  if (maisAntiga === null) return null;
  return Math.max(0, Math.floor((agoraMs - maisAntiga) / 60_000));
}

export type StatusSaude = "ok" | "degradado" | "fora";

export interface Saude {
  status: StatusSaude;
  verificado_em: string;
  banco: { ok: boolean; ms: number };
  variaveis: Record<VariavelEssencial, boolean>;
  /** Null quando não há o que medir (sem service key, sem marketplace ligado ou sem conexão ativa). */
  sincronizacao: { mais_antiga_min: number } | null;
  alertas: string[];
}

/**
 * Junta as checagens. `fora` (HTTP 503) só quando o banco não responde: é o que derruba o app
 * inteiro. Variável faltando ou sincronização atrasada é `degradado`, ainda 200, com o
 * motivo em `alertas` para o monitor por palavra-chave e para quem abrir a URL.
 */
export function montarSaude(entrada: {
  banco: { ok: boolean; ms: number };
  variaveis: Record<VariavelEssencial, boolean>;
  sincronizacaoMin: number | null;
  agora: Date;
}): Saude {
  const alertas: string[] = [];
  if (!entrada.banco.ok) alertas.push("O banco não respondeu.");
  const faltando = VARIAVEIS_ESSENCIAIS.filter((v) => !entrada.variaveis[v]);
  if (faltando.length) alertas.push(`Variável ausente: ${faltando.join(", ")}.`);
  if (entrada.sincronizacaoMin !== null && entrada.sincronizacaoMin > SINCRONIZACAO_ATRASADA_MIN) {
    alertas.push(`Há loja sem sincronizar há ${Math.floor(entrada.sincronizacaoMin / 60)} h.`);
  }
  const status: StatusSaude = !entrada.banco.ok ? "fora" : alertas.length ? "degradado" : "ok";
  return {
    status,
    verificado_em: entrada.agora.toISOString(),
    banco: entrada.banco,
    variaveis: entrada.variaveis,
    sincronizacao: entrada.sincronizacaoMin === null ? null : { mais_antiga_min: entrada.sincronizacaoMin },
    alertas,
  };
}

/** Rejeita se `promessa` não terminar a tempo (a consulta ainda é cancelada pelo AbortSignal). */
export function comTempoLimite<T>(promessa: PromiseLike<T>, ms: number): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error("tempo esgotado")), ms);
  });
  return Promise.race([Promise.resolve(promessa), limite]).finally(() => clearTimeout(relogio));
}
