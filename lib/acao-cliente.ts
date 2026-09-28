"use client";

import { toast } from "sonner";
import type { Resultado } from "./acao";

/**
 * Lado-cliente do contrato de `lib/acao.ts`.
 *
 * Mora em arquivo separado de propósito: `lib/acao.ts` é importado pelos `actions.ts`
 * ("use server"), e arrastar o `sonner` para lá colocaria uma dependência de interface
 * dentro do bundle do servidor.
 */

interface Mensagens {
  /** Toast de sucesso. Omitir quando a própria tela já mostra o resultado. */
  sucesso?: string;
  /** Usado só quando a chamada nem chegou a produzir um `Resultado` — ver abaixo. */
  erro: string;
}

/**
 * Executa a action, mostra o toast certo e devolve o `Resultado` para quem chamou decidir
 * o que fazer depois.
 *
 * Substitui o bloco que estava repetido 69 vezes em 23 arquivos:
 *
 *     try { await executar(acao(...)); toast.success("X"); setModal(null); }
 *     catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao ..."); }
 *
 * que vira:
 *
 *     const r = await executarComToast(acao(...), { sucesso: "X", erro: "Erro ao ..." });
 *     if (r.ok) setModal(null);
 *
 * Além das linhas, isto fecha a armadilha que `lib/acao.ts` documenta: chamar a action
 * sem `executar()` engolia o erro em silêncio, e o TypeScript não reclama de retorno
 * ignorado. Aqui a promessa é consumida sempre.
 *
 * **Por que ainda existe um `catch`:** a action pode falhar antes de virar `Resultado` —
 * rede caindo, deploy no meio do clique, resposta que não é a esperada. Esse erro não
 * passou por nenhum tradutor nosso, então mostrar `e.message` cru ("Failed to fetch")
 * não ajudaria ninguém: é aí que entra a mensagem `erro` do chamador.
 */
export async function executarComToast<T>(
  promessa: Promise<Resultado<T>>,
  mensagens: Mensagens,
): Promise<Resultado<T>> {
  try {
    const r = await promessa;
    if (r.ok) {
      if (mensagens.sucesso) toast.success(mensagens.sucesso);
    } else {
      // `r.erro` já passou por `traduzirErroSupabase`/`validar` no servidor — é texto
      // escrito para o usuário, não detalhe de infraestrutura.
      toast.error(r.erro);
    }
    return r;
  } catch (e) {
    console.error("[acao] falha antes do Resultado:", e);
    toast.error(mensagens.erro);
    return { ok: false, erro: mensagens.erro };
  }
}
