import type { Instrumentation } from "next";

/**
 * Observabilidade (onda D): todo erro que o Next pega no servidor (página, rota, Server
 * Action) vai para `erros_app` (0076) e aparece no Admin → Erros. Só em produção: no
 * desenvolvimento o terminal já mostra.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NODE_ENV !== "production") return;
  const { registrarErroApp } = await import("@/lib/erros-app");
  const { hashIpDaRequisicao } = await import("@/lib/ip");
  const e = err as Error & { digest?: string };
  // Hash da origem: a RPC (0077) aceita no máximo 10 por minuto do mesmo IP.
  const cabecalho = (nome: string) => {
    const v = request.headers[nome];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  await registrarErroApp({
    onde: "servidor",
    mensagem: `${context.routeType}: ${e?.message ?? String(err)}`,
    rota: request.path,
    digest: e?.digest ?? null,
    ipHash: await hashIpDaRequisicao({ get: cabecalho }).catch(() => null),
  });
};
