import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Se a conta tem PIN de administração, sem nunca ler o hash. Desde a 0081 o hash mora numa
 * tabela que o PostgREST não alcança e a resposta vem da RPC `tem_pin_admin`; antes dela,
 * da coluna antiga de `perfil_negocio`.
 */
export async function temPinAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("tem_pin_admin");
  if (!error) return data === true;
  if (error.code !== "PGRST202" && error.code !== "42883") return false;
  const antigo = await supabase.from("perfil_negocio").select("pin_admin_hash").maybeSingle();
  return !!antigo.data?.pin_admin_hash;
}
