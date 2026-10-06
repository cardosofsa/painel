"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CartaoAuth, ErroAuth } from "@/components/auth/CartaoAuth";
import { CampoSenha } from "@/components/auth/CampoSenha";
import { LinksLegais } from "@/components/legal/LinksLegais";
import { BotaoGoogle, DivisorOu } from "@/components/auth/BotaoGoogle";
import { traduzirErroAuth, ERROS_LINK } from "@/lib/erros";
import { reenviarConfirmacao } from "@/app/auth/actions";

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  // Erro de link vindo do callback (expirado, já usado, aberto em outro navegador). Antes
  // essas três situações levavam para cá sem nenhuma explicação.
  const [erro, setErro] = useState<string | null>(ERROS_LINK[params.get("erro") ?? ""] ?? null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setNaoConfirmado(false);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);

    if (error) {
      // O erro passa pelo tradutor em vez de virar um "E-mail ou senha inválidos" genérico:
      // quem não confirmou o e-mail tem a senha CERTA e, sem essa distinção, ficaria
      // tentando variações da senha para sempre.
      setErro(traduzirErroAuth(error));
      if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) {
        setNaoConfirmado(true);
      }
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function reenviar() {
    setReenviando(true);
    try {
      const r = await reenviarConfirmacao(email);
      // Falha (limite de envio, e-mail inválido) é erro, não aviso verde de "enviado".
      if (!r.ok) {
        setAviso(null);
        setErro(r.mensagem);
        return;
      }
      setErro(null);
      setAviso(r.mensagem);
      setNaoConfirmado(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível reenviar o e-mail.");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <CartaoAuth
      titulo="Entrar"
      rodape={
        <>
          Não tem conta?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Criar conta
          </Link>
          <LinksLegais className="mt-2" />
        </>
      }
    >
      <form onSubmit={entrar}>
        <FormField label="E-mail">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </FormField>

        <FormField label="Senha">
          <CampoSenha valor={senha} onChange={setSenha} autoComplete="current-password" />
        </FormField>

        {erro && <ErroAuth>{erro}</ErroAuth>}
        {aviso && (
          <p role="status" className="text-sm text-text-secondary mb-4">
            {aviso}
          </p>
        )}

        {naoConfirmado && (
          <Button
            type="button"
            variant="secondary"
            className="w-full mb-3"
            loading={reenviando}
            onClick={reenviar}
          >
            Reenviar e-mail de confirmação
          </Button>
        )}

        <Button type="submit" variant="primary" className="w-full" loading={carregando}>
          Entrar
        </Button>

        <p className="text-center text-xs mt-4">
          <Link href="/recuperar" className="text-text-secondary hover:text-accent hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </form>

      <DivisorOu />
      <BotaoGoogle />
    </CartaoAuth>
  );
}
