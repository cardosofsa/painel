import type { EnderecoCep } from "./cep";
import { buscarCep } from "@/app/(painel)/clientes/actions";

/** Busca de CEP para telas do painel: usa a Server Action, que exige sessão. */
export async function buscarCepPainel(cep: string): Promise<EnderecoCep | null> {
  const r = await buscarCep(cep);
  return r.ok ? r.dado : null;
}
