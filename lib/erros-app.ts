/**
 * Registro de erros do app (Fase 5, onda D) na tabela `erros_app` (0076), pela RPC
 * `registrar_erro_app`. Código de SERVIDOR.
 *
 * Desde a 0077 a RPC só executa com a service role (antes era aberta ao anon e um script no
 * console enchia a tabela). A service key aqui é exceção consciente à regra do CLAUDE.md: o
 * cliente de serviço só chama ESTA RPC, que não lê dado de conta nenhum — só grava mensagem,
 * rota, digest e o hash da origem, com campos cortados, freio por origem e por onde. Sem a
 * service key (ou sem a 0077 aplicada), cai no caminho antigo com a chave anônima.
 *
 * Nunca lança: registrar um erro não pode virar outro erro. Sem a 0076, não faz nada.
 */

import { createClient } from "@supabase/supabase-js";
import { clienteServico } from "@/lib/supabase/servico";

export interface ErroApp {
  onde: "servidor" | "navegador";
  mensagem: string;
  rota?: string | null;
  digest?: string | null;
  /** Hash da origem (`hashIpDaRequisicao`, lib/ip.ts) para o freio de 10/min por origem da 0077. */
  ipHash?: string | null;
}

/** Tira o que parece dado sensível antes de guardar: e-mails, tokens longos e números de documento. */
export function limparMensagemErro(m: string): string {
  return m
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?:eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{40,})\b/g, "[token]")
    .replace(/\b\d{11,14}\b/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/** Parâmetros da RPC da 0076 (sem o hash da origem, que só existe na 0077). */
export function parametrosErroApp(e: ErroApp) {
  return {
    p_onde: e.onde,
    p_mensagem: limparMensagemErro(e.mensagem || "Erro sem mensagem"),
    p_rota: e.rota?.split("?")[0]?.slice(0, 300) ?? null,
    p_digest: e.digest?.slice(0, 100) ?? null,
  };
}

export async function registrarErroApp(e: ErroApp): Promise<void> {
  try {
    const base = parametrosErroApp(e);
    const servico = clienteServico();
    if (servico) {
      const { error } = await servico.rpc("registrar_erro_app", { ...base, p_ip_hash: e.ipHash?.slice(0, 128) ?? null });
      if (!error) return;
      // Sem a 0077 a função ainda é a de 4 parâmetros (PGRST202): segue pelo caminho antigo.
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) return;
    const anonimo = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    await anonimo.rpc("registrar_erro_app", base);
  } catch {
    // Silêncio de propósito.
  }
}
