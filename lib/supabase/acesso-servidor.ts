import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CABECALHO_ACESSO, type AcessoRequisicao } from "@/lib/acesso-cookie";

/**
 * Quem está usando (id, e-mail, papel e abas) para Server Components.
 *
 * O middleware já validou o JWT e leu `perfis_acesso` (ou o cookie assinado dele) e passa
 * o resultado no cabeçalho interno `x-sertao-acesso`, que ele SEMPRE reescreve — o valor
 * mandado pelo navegador é descartado. Assim layout e páginas não refazem `getUser()` +
 * `perfis_acesso` em série a cada navegação.
 *
 * Sem o cabeçalho (rota pública, teste), cai para `getClaims()` + consulta. `cache()` faz
 * layout e página dividirem a mesma resposta dentro da requisição.
 */
export const acessoAtual = cache(async (): Promise<AcessoRequisicao | null> => {
  const bruto = (await headers()).get(CABECALHO_ACESSO);
  if (bruto) {
    try {
      const a = JSON.parse(decodeURIComponent(bruto)) as AcessoRequisicao;
      if (a && typeof a.userId === "string" && Array.isArray(a.abas)) return a;
    } catch {
      // cai para a consulta
    }
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: perfil } = await supabase.from("perfis_acesso").select("papel, abas").eq("user_id", sub).maybeSingle();
  return {
    userId: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    papel: perfil?.papel === "master" ? "master" : "usuario",
    abas: perfil?.abas ?? [],
  };
});
