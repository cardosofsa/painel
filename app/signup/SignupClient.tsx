"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CartaoAuth, ErroAuth } from "@/components/auth/CartaoAuth";
import { CampoSenha } from "@/components/auth/CampoSenha";
import { LinksLegais } from "@/components/legal/LinksLegais";
import { BotaoGoogle, DivisorOu } from "@/components/auth/BotaoGoogle";
import { traduzirErroAuth } from "@/lib/erros";
import { senhaSchema } from "@/lib/validacao";
import { useCaptcha } from "@/components/auth/Captcha";
import { MENSAGEM_FALTA_CAPTCHA, opcoesCaptcha } from "@/lib/captcha";
import { CHAVE_ORIGEM, mesclarOrigem, origemDaUrl, origemSalva, type OrigemCadastro } from "@/lib/indicacao";

/**
 * Origem do cadastro (0078): `?ref=` do link de indicação e `utm_*`. Fica no sessionStorage
 * para sobreviver a uma ida ao login e volta; armazenamento bloqueado = só a URL vale.
 */
function lerOrigem(): OrigemCadastro {
  let salva: OrigemCadastro = {};
  try {
    salva = origemSalva(window.sessionStorage.getItem(CHAVE_ORIGEM));
  } catch {
    // sessionStorage indisponível (aba anônima, bloqueado): segue só com a URL
  }
  const origem = mesclarOrigem(salva, origemDaUrl(window.location.search));
  try {
    if (Object.keys(origem).length) window.sessionStorage.setItem(CHAVE_ORIGEM, JSON.stringify(origem));
  } catch {
    // idem
  }
  return origem;
}

export function SignupClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const captcha = useCaptcha();

  // Guarda a origem assim que a página abre (antes de qualquer navegação).
  useEffect(() => {
    lerOrigem();
  }, []);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const validacao = senhaSchema.safeParse(senha);
    if (!validacao.success) {
      setErro(validacao.error.issues[0].message);
      return;
    }
    if (senha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    if (captcha.falta) {
      setErro(MENSAGEM_FALTA_CAPTCHA);
      return;
    }

    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      // `data` vai para raw_user_meta_data: o gatilho da 0078 lê o `ref` e grava a indicação.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?type=signup`, data: lerOrigem(), ...opcoesCaptcha(captcha.token) },
    });
    setCarregando(false);
    // O token do captcha é de uso único: a próxima tentativa precisa de outro.
    captcha.renovar();

    if (error) {
      setErro(traduzirErroAuth(error));
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setEnviado(true);
  }

  if (enviado) {
    return (
      <CartaoAuth titulo="Confira seu e-mail">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <MailCheck size={22} className="text-text-secondary" />
          </div>
          {/*
            Texto deliberadamente neutro, e isto não é preciosismo: com confirmação de e-mail
            ligada, o Supabase NÃO devolve erro para e-mail já cadastrado (é a proteção dele
            contra alguém descobrir quem tem conta). Antes esta tela afirmava "Enviamos um
            link de confirmação" mesmo nesse caso — e nada chegava, deixando quem já tinha
            conta esperando um e-mail que nunca viria. Agora a frase serve para os dois casos
            e aponta as duas saídas.
          */}
          <p className="text-sm text-text-primary mb-1">
            Se ainda não havia conta para <span className="font-medium">{email}</span>, enviamos o link de confirmação.
          </p>
          <p className="text-xs text-text-secondary mb-5">
            Se já existe uma conta com esse e-mail, use <strong>Entrar</strong> ou{" "}
            <strong>Esqueci minha senha</strong>. Confira também a caixa de spam.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/login">
              <Button variant="primary" className="w-full">
                Ir para o login
              </Button>
            </Link>
            <Link href="/recuperar" className="text-xs text-text-secondary hover:text-accent hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth
      titulo="Criar conta"
      descricao="Depois de confirmar o e-mail, seu cadastro passa por aprovação do administrador."
      rodape={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
          <LinksLegais className="mt-2" />
        </>
      }
    >
      <form onSubmit={cadastrar}>
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
          <CampoSenha valor={senha} onChange={setSenha} autoComplete="new-password" regras />
        </FormField>

        <FormField label="Confirmar senha">
          <CampoSenha valor={confirmarSenha} onChange={setConfirmarSenha} autoComplete="new-password" igualA={senha} />
        </FormField>

        {captcha.widget}

        {erro && <ErroAuth>{erro}</ErroAuth>}

        <Button type="submit" variant="primary" className="w-full" loading={carregando}>
          Criar conta
        </Button>
      </form>

      <DivisorOu />
      <BotaoGoogle rotulo="Cadastrar com Google" />
    </CartaoAuth>
  );
}
