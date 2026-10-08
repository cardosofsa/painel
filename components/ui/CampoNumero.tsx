"use client";

import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "./Modal";
import { formatarParaCampo, interpretarDigitado, valorAoSair } from "@/lib/campo-numero";

type Nativos = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "defaultValue">;

export interface CampoNumeroProps extends Nativos {
  value: number;
  onChange: (n: number) => void;
  /** Valor assumido ao sair do campo vazio/inválido (padrão 0). */
  padrao?: number;
  min?: number;
  max?: number;
  /** Casas decimais; 0 = inteiro (teclado numérico). */
  casas?: number;
}

/**
 * Campo numérico que pode ficar vazio enquanto se digita: só ao sair (blur) vazio volta
 * para `padrao`. Aceita vírgula. Seleciona o conteúdo no foco, para não precisar apagar o 0.
 */
export function CampoNumero({ value, onChange, padrao, min, max, casas, className, onBlur, onFocus, ...resto }: CampoNumeroProps) {
  const regras = { min, max, casas };
  const [texto, setTexto] = useState(() => formatarParaCampo(value));
  const [ultimo, setUltimo] = useState<number>(value);

  // O valor mudou por fora (reset, recálculo): ressincroniza o texto.
  if (value !== ultimo) {
    setUltimo(value);
    if (interpretarDigitado(texto, regras) !== value) setTexto(formatarParaCampo(value));
  }

  return (
    <input
      {...resto}
      type="text"
      inputMode={casas === 0 ? "numeric" : "decimal"}
      className={className ?? inputClass}
      value={texto}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        setTexto(t);
        const n = interpretarDigitado(t, regras);
        if (n !== null) {
          setUltimo(n);
          if (n !== value) onChange(n);
        }
      }}
      onBlur={(e) => {
        const n = valorAoSair(texto, regras, padrao ?? 0);
        setTexto(formatarParaCampo(n));
        setUltimo(n);
        if (n !== value) onChange(n);
        onBlur?.(e);
      }}
    />
  );
}
