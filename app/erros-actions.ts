"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { registrarErroApp } from "@/lib/erros-app";
import { hashIpDaRequisicao } from "@/lib/ip";

const erroSchema = z.object({
  mensagem: z.string().max(2000),
  rota: z.string().max(500).nullish(),
  digest: z.string().max(200).nullish(),
});

/**
 * Erro que o navegador mostrou na tela de "algo deu errado" (error boundary). Sem Resultado:
 * é disparo e esquece, e nunca pode lançar de volta para a tela que já está com erro.
 * Vai com o hash do IP: a RPC (0077) aceita no máximo 10 por minuto da mesma origem.
 */
export async function reportarErroNavegador(dados: z.input<typeof erroSchema>): Promise<void> {
  const v = erroSchema.safeParse(dados);
  if (!v.success) return;
  const ipHash = await hashIpDaRequisicao(await headers()).catch(() => null);
  await registrarErroApp({ onde: "navegador", mensagem: v.data.mensagem, rota: v.data.rota, digest: v.data.digest, ipHash });
}
