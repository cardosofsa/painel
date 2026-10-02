"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { segredoAcesso } from "@/lib/acesso-cookie";
import { TODAS_AS_ABAS } from "@/lib/acesso";
import { assinarOperador, COOKIE_OPERADOR, telaInicialOperador, VALIDADE_OPERADOR_MS } from "@/lib/operador-cookie";

/** Turno do operador (11.8): PIN confere no banco (0063) e o turno vai num cookie assinado. */

async function gravarTurno(userId: string, o: string, n: string, a: string[]) {
  const segredo = segredoAcesso();
  if (!segredo) throw new Error("Operadores precisam de ACESSO_SEGREDO (ou IA_CHAVE_COFRE) configurado no servidor.");
  (await cookies()).set(COOKIE_OPERADOR, await assinarOperador({ u: userId, o, n, a }, segredo), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(VALIDADE_OPERADOR_MS / 1000),
  });
}

export async function entrarOperador(operadorId: string, pin: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), operadorId);
    const p = validar(z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 números."), pin);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { data, error } = await supabase.rpc("entrar_operador", { p_id: id, p_pin: p });
    if (error?.code === "PGRST202") throw new Error("Operadores precisam da migração 0063.");
    if (error) throw new Error(error.message.includes("PIN") ? "PIN incorreto." : error.message);
    const op = (data as { id: string; nome: string; abas: string[] }[] | null)?.[0];
    if (!op) throw new Error("PIN incorreto.");
    await gravarTurno(auth.user.id, op.id, op.nome, op.abas);
    return { destino: telaInicialOperador(op.abas), nome: op.nome };
  });
}

/** O dono entra com o PIN de administrador (se houver) e vê tudo. */
export async function entrarComoDono(pinAdmin: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { data: ok, error } = await supabase.rpc("pin_admin_confere", { p_pin: pinAdmin || null });
    if (error?.code === "PGRST202") throw new Error("Operadores precisam da migração 0063.");
    if (error) throw new Error(error.message);
    if (!ok) throw new Error("PIN de administrador incorreto.");
    await gravarTurno(auth.user.id, "dono", "Dono", [...TODAS_AS_ABAS]);
    return { destino: "/dashboard" };
  });
}

export async function sairOperador() {
  return comResultado(async () => {
    (await cookies()).delete(COOKIE_OPERADOR);
  });
}
