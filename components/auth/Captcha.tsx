"use client";

import { useEffect, useRef, useState } from "react";
import { captchaAtivo, chaveCaptcha, faltaCaptcha, SCRIPT_TURNSTILE } from "@/lib/captcha";

/**
 * Widget do Cloudflare Turnstile (captcha opcional — ver `lib/captcha.ts`). Sem
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` não renderiza nada nem carrega script nenhum.
 *
 * O script é inserido por este componente (já confiável pelo nonce), e o `strict-dynamic` da
 * CSP propaga a confiança para ele; a origem também está em `script-src` para navegador sem
 * `strict-dynamic`, e em `frame-src` porque o desafio roda num iframe (`lib/csp.ts`).
 */

interface Turnstile {
  render(elemento: HTMLElement, opcoes: Record<string, unknown>): string | undefined;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let carregamento: Promise<void> | null = null;

function carregarTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (carregamento) return carregamento;
  carregamento = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_TURNSTILE;
    // Sob `strict-dynamic` o nonce não é exigido em script inserido por script confiável; vai
    // junto para o navegador que só entende nonce.
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) script.nonce = nonce;
    script.onload = () => resolve();
    script.onerror = () => {
      carregamento = null;
      script.remove();
      reject(new Error("Turnstile não carregou"));
    };
    document.head.appendChild(script);
  });
  return carregamento;
}

function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const aoToken = useRef(onToken);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    aoToken.current = onToken;
  });

  useEffect(() => {
    const chave = chaveCaptcha();
    if (!chave) return;
    let vivo = true;
    let id: string | undefined;
    carregarTurnstile().then(
      () => {
        if (!vivo || !caixa.current || !window.turnstile) return;
        id = window.turnstile.render(caixa.current, {
          sitekey: chave,
          language: "pt-br",
          // Sem tema escolhido, o site segue o sistema; "auto" faz o widget seguir também.
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : document.documentElement.dataset.theme === "light" ? "light" : "auto",
          size: "flexible",
          callback: (token: string) => aoToken.current(token),
          "expired-callback": () => aoToken.current(null),
          "timeout-callback": () => aoToken.current(null),
          "error-callback": () => aoToken.current(null),
        });
      },
      () => {
        if (vivo) setFalhou(true);
      },
    );
    return () => {
      vivo = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, []);

  return (
    <div className="mb-4">
      <div ref={caixa} />
      {falhou && (
        <p role="alert" className="text-xs text-negative mt-1">
          Não foi possível carregar a verificação contra robôs. Confira a conexão e recarregue a página.
        </p>
      )}
    </div>
  );
}

/**
 * Estado do captcha de um formulário. O token do Turnstile é de uso único: depois de cada
 * tentativa (certa ou errada) o Supabase já o consumiu, então `renovar()` remonta o widget
 * pela `key` e zera o token.
 *
 *     const captcha = useCaptcha();
 *     if (captcha.falta) return setErro(MENSAGEM_FALTA_CAPTCHA);
 *     await supabase.auth.signInWithPassword({ ..., options: opcoesCaptcha(captcha.token) });
 *     captcha.renovar();
 *     ...
 *     {captcha.widget}
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const ativo = captchaAtivo();
  return {
    ativo,
    token,
    falta: faltaCaptcha(token, ativo),
    renovar() {
      if (!ativo) return;
      setToken(null);
      setVersao((v) => v + 1);
    },
    widget: ativo ? <Captcha key={versao} onToken={setToken} /> : null,
  };
}
