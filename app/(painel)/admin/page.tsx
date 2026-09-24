import { createClient } from "@/lib/supabase/server";
import { AdminClient, type ContaAdmin } from "./AdminClient";

export default async function AdminPage() {
  const supabase = await createClient();

  // A RPC é security definer e confere e_master() por dentro; o middleware já barrou
  // quem não é master antes de chegar aqui, mas a trava que vale é a do banco.
  const { data, error } = await supabase.rpc("admin_listar_contas");
  if (error) throw new Error(error.message);

  return <AdminClient contas={(data ?? []) as ContaAdmin[]} />;
}
