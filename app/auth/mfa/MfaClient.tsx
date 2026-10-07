"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CartaoAuth, ErroAuth } from "@/components/auth/CartaoAuth";
import { traduzirErroAuth } from "@/lib/erros";
import { DIGITOS_CODIGO, codigoCompleto, limparCodigo, verificarSegundoFator } from "@/lib/mfa";

/**
 * O código vai do navegador direto para a GoTrue, como a senha no `LoginClient`, e não por
 * Server Action: o limite de tentativas do Supabase é por IP. Pelo servidor, toda conta
 * dividiria o IP da Vercel — quem chutasse códigos esgotaria o limite de todo mundo, e o
 * limite deixaria de frear quem chuta. Daqui, cada um gasta o próprio.
 *
 * O `verify` grava a sessão `aal2` nos cookies (o cliente do navegador do `@supabase/ssr`
 * guarda a sessão em cookie), e o middleware passa a deixar o painel abrir.
 */
export function MfaClient({ destino }: { destino: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Colar o código dispara a conferência e o Enter logo depois mandaria de novo: o estado
  // ainda não renderizou, a ref já mudou.
  const enviando = useRef(false);

  async function verificar(valor: string) {
    if (enviando.current) return;
    if (!codigoCompleto(valor)) {
      setErro("Digite os 6 números que aparecem no app autenticador.");
      return;
    }
    enviando.current = true;
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { erro: erroVerificacao, semFator } = await verificarSegundoFator(supabase, valor);
    if (erroVerificacao) {
      enviando.current = false;
      setCarregando(false);
      setCodigo("");
      setErro(traduzirErroAuth(erroVerificacao));
      return;
    }

    // Fator desativado em outro aparelho, ou removido pelo administrador: não há o que
    // conferir, mas o cookie da sessão ainda lista o fator antigo e o middleware mandaria de
    // volta para cá. Renovar a sessão traz o usuário atualizado; se nem isso der (sessões
    // encerradas pelo administrador), o caminho é entrar de novo.
    if (semFator) {
      const { error: erroRenovar } = await supabase.auth.refreshSession();
      if (erroRenovar) {
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/login");
        router.refresh();
        return;
      }
    }

    // `carregando` fica ligado até a navegação: evita um segundo envio do mesmo código.
    router.replace(destino);
    router.refresh();
  }

  async function sair() {
    setSaindo(true);
    // Só este aparelho: quem está nesta tela pode ser alguém que tem a senha e não o celular,
    // e o padrão (`global`) derrubaria as sessões da pessoa em todos os aparelhos.
    await createClient().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <CartaoAuth
      titulo="Verificação em duas etapas"
      descricao="Abra o app autenticador do celular e digite o código de 6 números da sua conta."
      rodape={
        <>
          Perdeu o celular ou trocou de aparelho? Peça ao administrador do sistema para remover a verificação da sua conta.
          <div className="mt-3">
            <Button type="button" variant="ghost" size="sm" onClick={sair} loading={saindo}>
              Sair e entrar com outra conta
            </Button>
          </div>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verificar(codigo);
        }}
      >
        <FormField label="Código do app">
          <input
            className={`${inputClass} font-mono text-lg tracking-[0.4em] text-center`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={DIGITOS_CODIGO + 2}
            placeholder="000000"
            value={codigo}
            onChange={(e) => {
              const valor = limparCodigo(e.target.value);
              setCodigo(valor);
              // Completo (digitado ou colado): confere sem esperar o clique.
              if (codigoCompleto(valor)) void verificar(valor);
            }}
          />
        </FormField>

        {erro && <ErroAuth>{erro}</ErroAuth>}

        <Button type="submit" variant="primary" className="w-full" loading={carregando}>
          Confirmar
        </Button>
      </form>
    </CartaoAuth>
  );
}
