/**
 * Decide QUAL IA atende a geração desta conta. Código de SERVIDOR.
 *
 * 1. A conta tem IA própria marcada como padrão → usa a chave dela (decifrada aqui).
 * 2. Senão, a IA do sistema (variáveis de ambiente).
 *
 * `origem` sai daqui e só daqui: o navegador nunca informa se a chamada é "própria" ou do
 * sistema, senão bastaria mentir para escapar do teste grátis (7.3).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decifrar, ErroCofre } from "./cofre";
import { ErroIA } from "./erro";
import { credencialDoSistema } from "./gemini";
import { PROVEDORES_IDS, type CredencialIA, type ProvedorId } from "./provedores";

export interface ProvedorResolvido extends CredencialIA {
  origem: "sistema" | "propria";
}

interface LinhaProvedor {
  provedor: string;
  modelo: string;
  chave_cifrada: string;
}

export async function resolverProvedor(supabase: SupabaseClient): Promise<ProvedorResolvido> {
  const { data: dadosClaims } = await supabase.auth.getClaims();
  const user = dadosClaims?.claims?.sub ? { id: dadosClaims.claims.sub } : null;

  if (user) {
    // Tabela ausente (migração 0035 não aplicada) ou erro de leitura: cai na IA do sistema
    // em vez de derrubar a geração.
    const { data } = await supabase
      .from("ia_provedores")
      .select("provedor, modelo, chave_cifrada")
      .eq("padrao", true)
      .maybeSingle<LinhaProvedor>();

    if (data && PROVEDORES_IDS.includes(data.provedor as ProvedorId)) {
      try {
        return {
          origem: "propria",
          provedor: data.provedor as ProvedorId,
          modelo: data.modelo,
          chave: decifrar(data.chave_cifrada, user.id),
        };
      } catch (e) {
        // Chave-mestra ausente/trocada ou linha adulterada: erro claro, sem cair
        // silenciosamente na IA do sistema (isso gastaria a cota sem a pessoa saber).
        if (e instanceof ErroCofre) throw new Error(e.message);
        throw e;
      }
    }
  }

  const sistema = credencialDoSistema();
  if (!sistema) throw new ErroIA("sem_chave");
  return { origem: "sistema", provedor: "gemini", chave: sistema.chave, modelo: sistema.modelo };
}

/** Para as telas decidirem se mostram os botões de IA: há IA própria OU a do sistema. */
export async function iaDisponivelParaConta(supabase: SupabaseClient): Promise<boolean> {
  if (credencialDoSistema()) return true;
  const { count } = await supabase
    .from("ia_provedores")
    .select("id", { count: "exact", head: true })
    .eq("padrao", true);
  return (count ?? 0) > 0;
}
