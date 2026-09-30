"use client";

import { FormField, inputClass } from "@/components/ui/Modal";

export interface DimensoesEnvio {
  peso_g: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  comprimento_cm: number | null;
}

function numero(v: string, inteiro = false): number | null {
  const n = Number(v.replace(",", "."));
  if (!v.trim() || !Number.isFinite(n) || n <= 0) return null;
  return inteiro ? Math.round(n) : Math.round(n * 10) / 10;
}

/**
 * Peso e medidas da embalagem pronta para envio — base para cotar frete. Numa variação,
 * `padrao` mostra o que vale para o grupo (placeholder) e o botão copia para este produto.
 */
export function CamposEnvio({
  valor,
  onChange,
  padrao,
}: {
  valor: DimensoesEnvio;
  onChange: (v: DimensoesEnvio) => void;
  /** Medidas padrão do grupo de variações, quando houver. */
  padrao?: DimensoesEnvio | null;
}) {
  const campo = (chave: keyof DimensoesEnvio, rotulo: string, inteiro = false) => (
    <FormField label={rotulo}>
      <input
        type="number"
        min={0}
        step={inteiro ? 1 : 0.1}
        className={inputClass}
        value={valor[chave] ?? ""}
        placeholder={padrao?.[chave] != null ? String(padrao[chave]) : "—"}
        onChange={(e) => onChange({ ...valor, [chave]: numero(e.target.value, inteiro) })}
      />
    </FormField>
  );
  const temPadrao = !!padrao && Object.values(padrao).some((v) => v != null);
  const vazio = Object.values(valor).every((v) => v == null);

  return (
    <div className="rounded-md border border-border p-3 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-text-secondary">Envio (embalagem pronta)</span>
        {temPadrao && vazio && (
          <button type="button" onClick={() => onChange({ ...padrao! })} className="text-xs text-accent hover:underline">
            Usar medidas do grupo
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {campo("peso_g", "Peso (g)", true)}
        {campo("altura_cm", "Altura (cm)")}
        {campo("largura_cm", "Largura (cm)")}
        {campo("comprimento_cm", "Compr. (cm)")}
      </div>
      <p className="text-xs text-text-tertiary -mt-1">Usado para cotar o frete. Numa variação, o que ficar vazio segue o padrão do grupo.</p>
    </div>
  );
}
