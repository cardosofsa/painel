"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

function LogoGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * "Continuar com Google". Volta para `/auth/callback`, que troca o código pela sessão; conta
 * nova cai em `/aguardando` como qualquer cadastro (o gatilho de perfil roda para todo
 * usuário novo do Auth, inclusive os que entram por OAuth).
 *
 * Exige o provedor Google ligado no Supabase (Authentication → Providers) e o endereço
 * `<site>/auth/callback` na lista de Redirect URLs.
 */
export function BotaoGoogle({ rotulo = "Continuar com Google" }: { rotulo?: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setErro(null);
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Sucesso navega para o Google e a página some; só chega aqui se falhar antes de sair.
    if (error) {
      setErro("Não foi possível iniciar o login com Google. Tente de novo.");
      setCarregando(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" className="w-full" onClick={entrar} loading={carregando}>
        {!carregando && <LogoGoogle />}
        {rotulo}
      </Button>
      {erro && (
        <p role="alert" className="text-sm text-negative mt-2">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Divisor "ou" entre o formulário de e-mail/senha e o botão do Google. */
export function DivisorOu() {
  return (
    <div className="flex items-center gap-3 my-4" aria-hidden="true">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-tertiary">ou</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
