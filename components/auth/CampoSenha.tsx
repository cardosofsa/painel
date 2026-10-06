"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { inputClass } from "@/components/ui/Modal";
import { SENHA_MIN } from "@/lib/validacao";

/**
 * Campo de senha com "mostrar/ocultar". Fica dentro do `FormField` (que é um `<label>`):
 * o botão é conteúdo interativo, então tocar nele alterna a visibilidade e não rouba o
 * foco para o campo.
 *
 * `regras`: mostra ao vivo o que a senha ainda precisa ter — a mesma regra de `senhaSchema`
 * (`lib/validacao.ts`), que continua sendo quem decide no envio.
 */
export function CampoSenha({
  valor,
  onChange,
  autoComplete,
  autoFocus,
  regras = false,
  igualA,
}: {
  valor: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  regras?: boolean;
  /** Campo de confirmação: avisa se bate com a senha. */
  igualA?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  const checagens = regras
    ? [
        { ok: valor.length >= SENHA_MIN, texto: `Pelo menos ${SENHA_MIN} caracteres` },
        { ok: valor.length > 0 && valor === valor.trim(), texto: "Sem espaço no começo ou no fim" },
      ]
    : igualA !== undefined && valor
      ? [{ ok: valor === igualA, texto: valor === igualA ? "As senhas coincidem" : "As senhas ainda não coincidem" }]
      : [];

  return (
    <>
      <span className="relative block">
        <input
          type={visivel ? "text" : "password"}
          required
          autoFocus={autoFocus}
          minLength={autoComplete === "new-password" ? SENHA_MIN : undefined}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-text-tertiary hover:text-text-primary rounded-r-md"
        >
          {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {checagens.length > 0 && (
        <span className="mt-1.5 flex flex-col gap-0.5" aria-live="polite">
          {checagens.map((c) => (
            <span key={c.texto} className={`inline-flex items-center gap-1.5 text-xs ${c.ok ? "text-positive" : "text-text-tertiary"}`}>
              {c.ok ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
              {c.texto}
            </span>
          ))}
        </span>
      )}
    </>
  );
}
