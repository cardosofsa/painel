"use client";

import { useEffect, useRef, useState } from "react";
import { cepCompleto, normalizarCep, type EnderecoCep } from "@/lib/cep";

export type EstadoCep = "parado" | "buscando" | "achou" | "nao-achou";

/**
 * Busca o endereço quando o CEP fica completo (8 dígitos).
 *
 * `onEndereco` roda no resultado do evento (não num efeito que copia estado), e um contador
 * descarta resposta velha: digitar outro CEP enquanto o anterior ainda volta não pode
 * sobrescrever o campo com o endereço errado.
 */
export function useCep(
  cep: string,
  onEndereco: (e: EnderecoCep) => void,
  buscar: (cep: string) => Promise<EnderecoCep | null>,
) {
  const [estado, setEstado] = useState<EstadoCep>("parado");
  const ultimo = useRef(0);
  const callback = useRef(onEndereco);

  useEffect(() => {
    callback.current = onEndereco;
  });

  useEffect(() => {
    if (!cepCompleto(cep)) return;
    const minha = ++ultimo.current;
    const digitos = normalizarCep(cep);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- estado da requisição em curso
    setEstado("buscando");
    buscar(digitos)
      .then((endereco) => {
        if (minha !== ultimo.current) return;
        if (endereco) {
          callback.current(endereco);
          setEstado("achou");
        } else {
          setEstado("nao-achou");
        }
      })
      .catch(() => {
        if (minha === ultimo.current) setEstado("nao-achou");
      });
    // `buscar` é uma função estável do módulo; incluí-la não muda quando a busca dispara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep]);

  return cepCompleto(cep) ? estado : "parado";
}
