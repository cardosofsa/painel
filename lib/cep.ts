/** Só os dígitos, no máximo 8. */
export function normalizarCep(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 8);
}

/** `12345678` → `12345-678`. Parcial (menos de 6 dígitos) fica sem hífen. */
export function formatarCep(valor: string): string {
  const d = normalizarCep(valor);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function cepCompleto(valor: string): boolean {
  return normalizarCep(valor).length === 8;
}

export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Interpreta a resposta do ViaCEP. CEP inexistente volta `{ "erro": true }` com status 200,
 * então "resposta ok" não basta — e cada campo é validado como texto, porque isto vem de um
 * serviço de terceiros e vai parar em campo do formulário.
 */
export function interpretarViaCep(json: unknown): EnderecoCep | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (j.erro === true || j.erro === "true") return null;

  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const cidade = texto(j.localidade, 80);
  const uf = texto(j.uf, 10).toUpperCase();
  if (!cidade || uf.length !== 2) return null;

  return {
    logradouro: texto(j.logradouro, 120),
    bairro: texto(j.bairro, 80),
    cidade,
    uf,
  };
}
