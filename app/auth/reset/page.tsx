import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ResetClient } from "./ResetClient";

export const metadata: Metadata = {
  title: "Definir nova senha · Segundo Cérebro",
};

export default async function ResetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A sessão aqui vem do link de recuperação, que o `/auth/callback` já trocou por cookies.
  // Sem ela, o link venceu ou já foi usado — e o cliente mostra essa explicação em vez de
  // um formulário que falharia no envio.
  return <ResetClient temSessao={!!user} />;
}
