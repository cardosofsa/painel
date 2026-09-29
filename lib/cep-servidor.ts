import { cepCompleto, interpretarViaCep, normalizarCep, type EnderecoCep } from "./cep";

/**
 * Consulta o ViaCEP a partir do SERVIDOR.
 *
 * Do navegador não dá: a CSP (`lib/csp.ts`, `connect-src`) só libera o próprio site e o
 * Supabase, e abrir uma origem de terceiros para o app inteiro só para isso enfraqueceria a
 * política. Consultando daqui, a CSP fica como está e o resultado ainda pode ser cacheado.
 *
 * Devolve `null` para CEP inválido, inexistente ou serviço fora do ar — a tela trata os três
 * do mesmo jeito (deixa preencher à mão), então não vale distinguir.
 */
export async function consultarCep(cep: string): Promise<EnderecoCep | null> {
  const digitos = normalizarCep(cep);
  if (!cepCompleto(digitos)) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!resposta.ok) return null;
    return interpretarViaCep(await resposta.json());
  } catch {
    return null;
  }
}
