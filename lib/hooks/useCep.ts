"use client";

import { useEffect, useRef, useState } from "react";
import { cepCompleto, normalizarCep, type EnderecoCep } from "@/lib/cep";
import { buscarCep } from "@/app/(painel)/clientes/actions";

export type EstadoCep = "parado" | "buscando" | "achou" | "nao-achou";

/**
 * Busca o endereço quando o CEP fica completo (8 dígitos).
 *
 * `onEndereco` roda no resultado do evento (não num efeito que copia estado), e um contador
 * descarta resposta velha: digitar outro CEP enquanto o anterior ainda volta não pode
 * sobrescrever o campo com o endereço errado.
 */
export function useCep(cep: string, onEndereco: (e: EnderecoCep) => void) {
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
    buscarCep(digitos)
      .then((r) => {
        if (minha !== ultimo.current) return;
        if (r.ok && r.dado) {
          callback.current(r.dado);
          setEstado("achou");
        } else {
          setEstado("nao-achou");
        }
      })
      .catch(() => {
        if (minha === ultimo.current) setEstado("nao-achou");
      });
  }, [cep]);

  return cepCompleto(cep) ? estado : "parado";
}
