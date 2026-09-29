"use client";

import { useState } from "react";
import { FormField, inputClass } from "@/components/ui/Modal";
import { formatarCep, type EnderecoCep } from "@/lib/cep";
import { useCep } from "@/lib/hooks/useCep";

export interface EnderecoForm {
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento?: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

const NENHUM_TRAVADO = { endereco: false, bairro: false, cidade: false, uf: false };

/**
 * Bloco de endereço com CEP na frente. Ao completar o CEP, preenche logradouro, bairro,
 * cidade e UF e **trava** o que veio do CEP (some a chance de digitar cidade errada); o
 * botão "Editar manualmente" destrava. Número e complemento nunca vêm do CEP e ficam livres.
 *
 * A busca só dispara quando o CEP é **digitado aqui** (`cepBusca`), não quando o formulário
 * abre com um cliente já salvo — senão editar um cliente antigo sobrescreveria o endereço
 * que ele tem hoje.
 */
export function CamposEndereco({
  valor,
  onChange,
  comComplemento = true,
}: {
  valor: EnderecoForm;
  onChange: (patch: Partial<EnderecoForm>) => void;
  /** Endereço de empresa não usa complemento; cliente sim. */
  comComplemento?: boolean;
}) {
  const [cepBusca, setCepBusca] = useState("");
  const [travado, setTravado] = useState(NENHUM_TRAVADO);

  const estado = useCep(cepBusca, (e: EnderecoCep) => {
    onChange({
      endereco: e.logradouro || valor.endereco,
      bairro: e.bairro || valor.bairro,
      cidade: e.cidade,
      uf: e.uf,
    });
    setTravado({ endereco: !!e.logradouro, bairro: !!e.bairro, cidade: true, uf: true });
  });

  const algumTravado = travado.endereco || travado.bairro || travado.cidade || travado.uf;

  return (
    <>
      <FormField
        label="CEP"
        dica={
          estado === "buscando"
            ? "Buscando endereço…"
            : estado === "nao-achou"
              ? "CEP não encontrado — preencha o endereço à mão."
              : undefined
        }
      >
        <input
          className={inputClass}
          inputMode="numeric"
          placeholder="00000-000"
          value={formatarCep(valor.cep ?? "")}
          onChange={(e) => {
            const cep = formatarCep(e.target.value);
            setCepBusca(cep);
            setTravado(NENHUM_TRAVADO);
            onChange({ cep: cep || null });
          }}
        />
      </FormField>

      <FormField label="Rua / Logradouro">
        <input
          className={inputClass}
          value={valor.endereco ?? ""}
          readOnly={travado.endereco}
          onChange={(e) => onChange({ endereco: e.target.value || null })}
        />
      </FormField>

      <div className={comComplemento ? "grid grid-cols-[1fr_2fr] gap-4" : ""}>
        <FormField label="Número">
          <input className={inputClass} value={valor.numero ?? ""} onChange={(e) => onChange({ numero: e.target.value || null })} />
        </FormField>
        {comComplemento && (
          <FormField label="Complemento">
            <input
              className={inputClass}
              value={valor.complemento ?? ""}
              onChange={(e) => onChange({ complemento: e.target.value || null })}
            />
          </FormField>
        )}
      </div>

      <FormField label="Bairro">
        <input
          className={inputClass}
          value={valor.bairro ?? ""}
          readOnly={travado.bairro}
          onChange={(e) => onChange({ bairro: e.target.value || null })}
        />
      </FormField>

      <div className="grid grid-cols-[2fr_80px] gap-4">
        <FormField label="Cidade">
          <input
            className={inputClass}
            value={valor.cidade ?? ""}
            readOnly={travado.cidade}
            onChange={(e) => onChange({ cidade: e.target.value || null })}
          />
        </FormField>
        <FormField label="UF">
          <input
            className={inputClass}
            maxLength={2}
            value={valor.uf ?? ""}
            readOnly={travado.uf}
            onChange={(e) => onChange({ uf: e.target.value.toUpperCase() || null })}
          />
        </FormField>
      </div>

      {algumTravado && (
        <button
          type="button"
          onClick={() => setTravado(NENHUM_TRAVADO)}
          className="text-xs text-accent hover:underline -mt-2 mb-3"
        >
          Editar endereço manualmente
        </button>
      )}
    </>
  );
}
