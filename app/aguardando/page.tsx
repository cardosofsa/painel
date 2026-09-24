import { redirect } from "next/navigation";
import { Clock, Ban, CalendarX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acessoExpirado, contaLiberada } from "@/lib/acesso";
import { SairButton } from "./SairButton";

/**
 * Onde cai quem tem login mas ainda não tem acesso: conta recém-criada esperando
 * aprovação, conta suspensa pelo master ou acesso com data vencida.
 */
export default async function AguardandoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfis_acesso")
    .select("status, expira_em")
    .eq("user_id", user.id)
    .maybeSingle();

  if (perfil && contaLiberada(perfil)) redirect("/dashboard");

  const expirou = perfil ? acessoExpirado(perfil.expira_em) : false;
  const suspensa = perfil?.status === "suspenso";

  const { Icone, titulo, descricao } = expirou
    ? {
        Icone: CalendarX,
        titulo: "Seu acesso venceu",
        descricao: "O período de acesso desta conta chegou ao fim. Fale com o administrador para renovar.",
      }
    : suspensa
      ? {
          Icone: Ban,
          titulo: "Acesso suspenso",
          descricao: "Esta conta foi suspensa pelo administrador. Seus dados continuam guardados.",
        }
      : {
          Icone: Clock,
          titulo: "Cadastro em análise",
          descricao:
            "Sua conta foi criada e está aguardando liberação do administrador. Você recebe acesso assim que ela for aprovada.",
        };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-1 border border-border rounded-lg p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <Icone size={22} className="text-text-secondary" />
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">{titulo}</h1>
        <p className="text-sm text-text-secondary mb-1">{descricao}</p>
        <p className="text-xs text-text-tertiary mb-6">{user.email}</p>
        <SairButton />
      </div>
    </div>
  );
}
