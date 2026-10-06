"use server";

import { z } from "zod";
import { registrarErroApp } from "@/lib/erros-app";

const erroSchema = z.object({
  mensagem: z.string().max(2000),
  rota: z.string().max(500).nullish(),
  digest: z.string().max(200).nullish(),
});

/**
 * Erro que o navegador mostrou na tela de "algo deu errado" (error boundary). Sem Resultado:
 * é disparo e esquece, e nunca pode lançar de volta para a tela que já está com erro.
 */
export async function reportarErroNavegador(dados: z.input<typeof erroSchema>): Promise<void> {
  const v = erroSchema.safeParse(dados);
  if (!v.success) return;
  await registrarErroApp({ onde: "navegador", mensagem: v.data.mensagem, rota: v.data.rota, digest: v.data.digest });
}
