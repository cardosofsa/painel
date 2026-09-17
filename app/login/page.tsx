"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={entrar} className="w-full max-w-sm bg-surface-1 border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-on text-xs font-bold">
            P
          </span>
          <span className="font-semibold tracking-tight text-text-primary text-lg">Painel</span>
        </div>

        <label className="block text-xs font-medium text-text-secondary mb-1.5">E-mail</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        <label className="block text-xs font-medium text-text-secondary mb-1.5">Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        {erro && <p className="text-sm text-negative mb-4">{erro}</p>}

        <Button type="submit" variant="primary" className="w-full" disabled={carregando}>
          {carregando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
