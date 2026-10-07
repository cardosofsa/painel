import { createClient } from "@/lib/supabase/server";
import { temPinAdmin } from "@/lib/supabase/pin-admin";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { OperadorClient } from "./OperadorClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Operador" };

/** "Quem está operando?" (11.8): escolhe o operador e digita o PIN. */
export default async function OperadorPage() {
  const supabase = await createClient();
  const acesso = await acessoAtual();
  const [opsRes, pinAdmin] = await Promise.all([
    supabase.from("operadores").select("id, nome, ativo").eq("ativo", true).order("nome"),
    // Só para saber SE existe PIN de administrador (o hash não sai do servidor).
    temPinAdmin(supabase),
  ]);
  return (
    <OperadorClient
      operadores={opsRes.error ? [] : ((opsRes.data ?? []) as { id: string; nome: string }[])}
      semMigracao={!!opsRes.error}
      temPinAdmin={pinAdmin}
      atual={acesso?.operador?.nome ?? null}
    />
  );
}
