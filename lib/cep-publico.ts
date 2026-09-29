import type { EnderecoCep } from "./cep";

/** Busca de CEP para a vitrine pública: passa pela rota `/api/vitrine/cep/[cep]` (sem login). */
export async function buscarCepPublico(cep: string): Promise<EnderecoCep | null> {
  try {
    const resposta = await fetch(`/api/vitrine/cep/${encodeURIComponent(cep)}`);
    if (!resposta.ok) return null;
    return (await resposta.json()) as EnderecoCep;
  } catch {
    return null;
  }
}
