import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a service key (ignora RLS). Código de SERVIDOR, só para o que a anon key não
 * pode e não deve fazer — ex.: ler o token de frete do dono de um catálogo público. Sempre
 * filtrar por `user_id` explícito. Sem a variável, devolve null e o recurso fica desligado.
 */
export function clienteServico(): SupabaseClient | null {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!chave || !url) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
