import { NextResponse, type NextRequest } from "next/server";
import { cepCompleto, normalizarCep } from "@/lib/cep";
import { consultarCep } from "@/lib/cep-servidor";

/**
 * CEP → endereço para o checkout da vitrine pública (cliente final, sem login).
 *
 * Fica sob `/api/vitrine` de propósito: é o prefixo que o middleware já libera sem sessão.
 * A consulta é feita aqui, no servidor, porque a CSP só permite o próprio site e o Supabase
 * no `connect-src` — o navegador não pode chamar o ViaCEP direto. Só devolve logradouro,
 * bairro, cidade e UF (dados públicos do CEP); nada do banco passa por aqui.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ cep: string }> }) {
  const { cep } = await params;
  const digitos = normalizarCep(cep);
  if (!cepCompleto(digitos) || digitos !== cep.replace(/\D/g, "")) {
    return NextResponse.json({ erro: "CEP inválido." }, { status: 400 });
  }

  const endereco = await consultarCep(digitos);
  if (!endereco) return NextResponse.json({ erro: "CEP não encontrado." }, { status: 404 });

  return NextResponse.json(endereco, { headers: { "cache-control": "public, max-age=86400" } });
}
