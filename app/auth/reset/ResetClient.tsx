"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CartaoAuth, ErroAuth } from "@/components/auth/CartaoAuth";
import { SENHA_MIN } from "@/lib/validacao";
import { redefinirSenha } from "@/app/auth/actions";

/**
 * Tela terminal de propósito: sem barra lateral, sem link para o painel. Quem chegou aqui
 * veio do link de recuperação e tem uma sessão válida — o objetivo é que ele saia daqui com
 * a senha trocada, não que comece a navegar no sistema.
 */
export function ResetClient({ temSessao }: { temSessao: boolean }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await redefinirSenha(senha, confirmacao);
      if (r.ok) setPronto(true);
      else setErro(r.mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setCarregando(false);
    }
  }

  // Sem sessão: link expirado, já usado, ou alguém digitou a URL. Antes um caso como este
  // acabava numa tela vazia ou no login sem explicação.
  if (!temSessao) {
    return (
      <CartaoAuth titulo="Link inválido ou expirado">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <LinkIcon size={22} className="text-text-secondary" />
          </div>
          <p className="text-sm text-text-secondary mb-5">
            Links de redefinição valem por tempo limitado e só podem ser usados uma vez. Peça um novo para continuar.
          </p>
          <Link href="/recuperar">
            <Button variant="primary" className="w-full">
              Pedir novo link
            </Button>
          </Link>
        </div>
      </CartaoAuth>
    );
  }

  if (pronto) {
    return (
      <CartaoAuth titulo="Senha redefinida">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-positive-soft flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={22} className="text-positive" />
          </div>
          <p className="text-sm text-text-secondary mb-5">
            Sua senha foi trocada e as sessões abertas em outros aparelhos foram encerradas. Entre com a senha nova.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              router.push("/login");
              router.refresh();
            }}
          >
            Ir para o login
          </Button>
        </div>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth titulo="Definir nova senha" descricao="Escolha uma senha que você não use em outro site.">
      <form onSubmit={salvar}>
        <FormField label={`Nova senha (mínimo ${SENHA_MIN} caracteres)`}>
          <input
            type="password"
            required
            autoFocus
            minLength={SENHA_MIN}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={inputClass}
          />
        </FormField>

        <FormField label="Confirmar nova senha">
          <input
            type="password"
            required
            minLength={SENHA_MIN}
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className={inputClass}
          />
        </FormField>

        {erro && <ErroAuth>{erro}</ErroAuth>}

        <Button type="submit" variant="primary" className="w-full" loading={carregando}>
          Salvar nova senha
        </Button>
      </form>
    </CartaoAuth>
  );
}
