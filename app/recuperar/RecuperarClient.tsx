"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CartaoAuth, ErroAuth } from "@/components/auth/CartaoAuth";
import { solicitarRecuperacaoSenha } from "@/app/auth/actions";

export function RecuperarClient() {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await solicitarRecuperacaoSenha(email);
      if (r.ok) setEnviado(r.mensagem);
      else setErro(r.mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o link.");
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <CartaoAuth titulo="Link enviado">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <MailCheck size={22} className="text-text-secondary" />
          </div>
          <p className="text-sm text-text-secondary mb-5">{enviado}</p>
          <Link href="/login">
            <Button variant="primary" className="w-full">
              Voltar para o login
            </Button>
          </Link>
        </div>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth
      titulo="Recuperar senha"
      descricao="Informe o e-mail da conta. Enviamos um link para você definir uma senha nova."
      rodape={
        <Link href="/login" className="text-accent hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form onSubmit={pedirLink}>
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

        {erro && <ErroAuth>{erro}</ErroAuth>}

        <Button type="submit" variant="primary" className="w-full" loading={carregando}>
          Enviar link
        </Button>
      </form>
    </CartaoAuth>
  );
}
