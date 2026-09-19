"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { Brain } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setCarregando(false);

    if (error) {
      setErro(error.message === "User already registered" ? "Este e-mail já está cadastrado." : error.message);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setEmailEnviado(true);
  }

  if (emailEnviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm bg-surface-1 border border-border rounded-lg shadow-sm p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-on">
              <Brain size={16} strokeWidth={2.25} />
            </span>
            <span className="font-semibold tracking-tight text-text-primary text-lg">Segundo Cérebro</span>
          </div>
          <p className="text-sm text-text-primary mb-2">Enviamos um link de confirmação para</p>
          <p className="text-sm font-medium text-text-primary mb-4">{email}</p>
          <p className="text-xs text-text-secondary mb-4">
            Abra seu e-mail e clique no link para verificar a conta e entrar.
          </p>
          <Link href="/login" className="text-sm text-accent hover:underline">
            Voltar para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={cadastrar} className="w-full max-w-sm bg-surface-1 border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-on">
            <Brain size={16} strokeWidth={2.25} />
          </span>
          <span className="font-semibold tracking-tight text-text-primary text-lg">Segundo Cérebro</span>
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
          minLength={6}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        <label className="block text-xs font-medium text-text-secondary mb-1.5">Confirmar senha</label>
        <input
          type="password"
          required
          minLength={6}
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
          className={`${inputClass} mb-4`}
        />

        {erro && <p className="text-sm text-negative mb-4">{erro}</p>}

        <Button type="submit" variant="primary" className="w-full mb-4" disabled={carregando}>
          {carregando ? "Criando conta…" : "Criar conta"}
        </Button>

        <p className="text-center text-xs text-text-secondary">
          Já tem conta?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
