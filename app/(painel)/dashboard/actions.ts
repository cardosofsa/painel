"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, compromissoSchema, dataCalendarioSchema, preferenciasCalendarioSchema, periodoCalendarioSchema } from "@/lib/validacao";
import { carregarFontesPeriodo } from "@/lib/calendario-servidor";
import type { Camada } from "@/lib/calendario-dashboard";
import { comResultado } from "@/lib/acao";

const PATH = "/dashboard";

export interface CompromissoInput {
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
}

export async function criarCompromisso(dados: CompromissoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").insert(validar(compromissoSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

export async function atualizarCompromisso(id: string, dados: CompromissoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").update(validar(compromissoSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

export async function removerCompromisso(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("compromissos").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

/** "Primeiros passos" não aparece mais para esta conta (0065). */
export async function ocultarPrimeirosPassos() {
  return comResultado(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");
    const { error } = await supabase.from("perfil_negocio").upsert({ user_id: user.id, onboarding_oculto: true, atualizado_em: new Date().toISOString() });
    if (error?.code === "PGRST204" || error?.code === "42703") throw new Error("Ocultar precisa da migração 0065. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

// ---------- Calendário (0068) ----------

/** Compromissos, vencimentos e datas próprias de um período (ao navegar pelos meses). */
export async function carregarCalendario(inicio: string, fim: string) {
  return comResultado(async () => {
    const p = validar(periodoCalendarioSchema, { inicio, fim });
    const supabase = await createClient();
    return carregarFontesPeriodo(supabase, p.inicio, p.fim);
  });
}

const SEM_0068 = "O calendário personalizado precisa da migração 0068. Aplique no Supabase e recarregue.";
const semColuna = (code?: string) => code === "PGRST204" || code === "42703" || code === "PGRST205" || code === "42P01";

/** Estado dos feriados estaduais e camadas visíveis: ficam no perfil, valem em qualquer aparelho. */
export async function salvarPreferenciasCalendario(dados: { uf: string | null; camadas: Camada[] }) {
  return comResultado(async () => {
    const v = validar(preferenciasCalendarioSchema, dados);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");
    const { error } = await supabase
      .from("perfil_negocio")
      .upsert({ user_id: user.id, calendario_uf: v.uf, calendario_camadas: v.camadas, atualizado_em: new Date().toISOString() });
    if (semColuna(error?.code)) throw new Error(SEM_0068);
    if (error) lancarErroSupabase(error);
  });
}

export interface DataCalendarioInput {
  titulo: string;
  data: string;
  repete_todo_ano: boolean;
  tipo: "municipal" | "pessoal" | "promocao";
  observacao: string | null;
}

export async function criarDataCalendario(dados: DataCalendarioInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("datas_calendario").insert(validar(dataCalendarioSchema, dados));
    if (semColuna(error?.code)) throw new Error(SEM_0068);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

export async function removerDataCalendario(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("datas_calendario").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

