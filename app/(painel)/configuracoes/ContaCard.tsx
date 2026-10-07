"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { traduzirErroAuth } from "@/lib/erros";
import { senhaSchema, SENHA_MIN } from "@/lib/validacao";
import { useCaptcha } from "@/components/auth/Captcha";
import { MENSAGEM_FALTA_CAPTCHA, opcoesCaptcha } from "@/lib/captcha";
import { DIGITOS_CODIGO, codigoCompleto, limparCodigo, verificarSegundoFator } from "@/lib/mfa";

/**
 * E-mail + trocar senha. Extraído de `ConfiguracoesClient.tsx` (onde era função privada)
 * porque agora tem dois consumidores: a tela cheia de Configurações (conta comum) e
 * `MasterConfiguracoesClient.tsx` — a conta master só precisa desta parte, o resto da tela
 * cheia é tudo dado de loja que master não tem.
 */
export function ContaCard({ email }: { email: string }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Conta com verificação em duas etapas: o código do app entra na troca (ver abaixo).
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [codigoMfa, setCodigoMfa] = useState("");
  const captcha = useCaptcha();

  async function alterarSenha() {
    if (!senhaAtual) {
      toast.error("Informe a senha atual.");
      return;
    }
    const validacao = senhaSchema.safeParse(novaSenha);
    if (!validacao.success) {
      toast.error(validacao.error.issues[0].message);
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (captcha.falta) {
      toast.error(MENSAGEM_FALTA_CAPTCHA);
      return;
    }
    setSalvando(true);
    const supabase = createClient();

    // Com verificação em duas etapas, a reentrada logo abaixo devolve uma sessão aal1 — e a
    // GoTrue recusa trocar a senha de quem tem fator sem aal2 (`insufficient_aal`). O código
    // é pedido ANTES de reentrar: sem ele em mãos, a sessão cairia para aal1 à toa.
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const temMfa = nivel?.nextLevel === "aal2";
    if (temMfa && !codigoCompleto(codigoMfa)) {
      setSalvando(false);
      setPedirCodigo(true);
      toast.error("Digite o código do app autenticador para confirmar a troca de senha.");
      return;
    }

    // Re-login imediatamente antes: é o que satisfaz a exigência de "sessão recente" quando
    // "Secure password change" está ligado no painel do Supabase — e esse ajuste do painel,
    // não este código, é o que de fato impede alguém de trocar a senha pelo console do
    // navegador com uma sessão aberta.
    const { error: erroReautenticacao } = await supabase.auth.signInWithPassword({ email, password: senhaAtual, options: opcoesCaptcha(captcha.token) });
    // O token do captcha é de uso único.
    captcha.renovar();
    if (erroReautenticacao) {
      setSalvando(false);
      toast.error(erroReautenticacao.code === "captcha_failed" ? traduzirErroAuth(erroReautenticacao) : "Senha atual incorreta.");
      return;
    }

    if (temMfa) {
      const { erro: erroCodigo } = await verificarSegundoFator(supabase, codigoMfa);
      setCodigoMfa("");
      if (erroCodigo) {
        setSalvando(false);
        toast.error(traduzirErroAuth(erroCodigo));
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) {
      setSalvando(false);
      toast.error(traduzirErroAuth(error));
      return;
    }

    // Trocar a senha não revoga os refresh tokens já emitidos. Sem isto, "troquei a senha
    // porque alguém entrou na minha conta" deixa o invasor logado no aparelho dele.
    const { error: erroSaida } = await supabase.auth.signOut({ scope: "others" });
    setSalvando(false);
    if (erroSaida) console.error("[auth] signOut others", erroSaida.code, erroSaida.message);

    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarSenha("");
    setPedirCodigo(false);
    toast.success("Senha alterada. As sessões em outros aparelhos foram encerradas.");
  }

  return (
    <Card className="h-full flex flex-col">
      <CardTitle className="mb-4">Acesso: e-mail e senha</CardTitle>
      <FormField label="E-mail">
        <input className={inputClass} value={email} disabled />
      </FormField>
      <div className="border-t border-border pt-4 mb-4">
        <span className="text-sm font-medium text-text-primary">Alterar senha</span>
      </div>
      <FormField label="Senha atual">
        <input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />
      </FormField>
      <FormField label={`Nova senha (mínimo ${SENHA_MIN} caracteres)`}>
        <input
          type="password"
          minLength={SENHA_MIN}
          autoComplete="new-password"
          className={inputClass}
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />
      </FormField>
      <FormField label="Confirmar nova senha">
        <input
          type="password"
          minLength={SENHA_MIN}
          autoComplete="new-password"
          className={inputClass}
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
        />
      </FormField>
      {pedirCodigo && (
        <FormField label="Código do app autenticador" dica="A conta tem verificação em duas etapas: a troca de senha pede o código.">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={DIGITOS_CODIGO + 2}
            placeholder="000000"
            className={`${inputClass} font-mono tracking-[0.3em]`}
            value={codigoMfa}
            onChange={(e) => setCodigoMfa(limparCodigo(e.target.value))}
          />
        </FormField>
      )}
      {captcha.widget}
      <div className="mt-auto pt-2">
        <Button variant="primary" onClick={alterarSenha} loading={salvando}>
          Alterar senha
        </Button>
      </div>
    </Card>
  );
}
