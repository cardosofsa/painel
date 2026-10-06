/**
 * Registro de erros do app (Fase 5, onda D) na tabela `erros_app` (0076), pela RPC
 * `registrar_erro_app` com a chave ANÔNIMA — não precisa de service role nem de sessão
 * (a RPC é security definer, corta os campos e tem freio de 60/min). Código de SERVIDOR.
 *
 * Nunca lança: registrar um erro não pode virar outro erro. Sem a 0076, não faz nada.
 */

import { createClient } from "@supabase/supabase-js";

export interface ErroApp {
  onde: "servidor" | "navegador";
  mensagem: string;
  rota?: string | null;
  digest?: string | null;
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

export async function registrarErroApp(e: ErroApp): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) return;
    const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    await supabase.rpc("registrar_erro_app", {
      p_onde: e.onde,
      p_mensagem: limparMensagemErro(e.mensagem || "Erro sem mensagem"),
      p_rota: e.rota?.split("?")[0]?.slice(0, 300) ?? null,
      p_digest: e.digest?.slice(0, 100) ?? null,
    });
  } catch {
    // Silêncio de propósito.
  }
}
