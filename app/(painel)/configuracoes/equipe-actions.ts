"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { TODAS_AS_ABAS } from "@/lib/acesso";

/** Configurações → Equipe (11.8). O PIN é tratado só no banco (hash) — 0063. */

const operadorSchema = z.object({
  id: z.string().uuid().nullable(),
  nome: z.string().trim().min(1).max(60),
  pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 números.").nullable(),
  abas: z.array(z.enum(TODAS_AS_ABAS as [string, ...string[]])).min(1, "Escolha pelo menos uma tela."),
  comissao_pct: z.number().finite().min(0).max(100),
  comissao_base: z.enum(["venda", "lucro"]),
  ativo: z.boolean(),
  pinAdmin: z.string().max(12).nullable(),
});

function erroDoBanco(error: { code?: string; message: string }): never {
  if (error.code === "PGRST202") throw new Error("Operadores precisam da migração 0063.");
  if (error.code === "23505") throw new Error("Já existe um operador com esse nome.");
  throw new Error(error.message);
}

export async function salvarOperador(dados: z.input<typeof operadorSchema>) {
  return comResultado(async () => {
    const v = validar(operadorSchema, dados);
    const supabase = await createClient();
    const { error } = await supabase.rpc("salvar_operador", {
      p_id: v.id,
      p_nome: v.nome,
      p_pin: v.pin,
      p_abas: v.abas,
      p_comissao_pct: v.comissao_pct,
      p_comissao_base: v.comissao_base,
      p_ativo: v.ativo,
      p_pin_admin: v.pinAdmin,
    });
    if (error) erroDoBanco(error);
    revalidatePath("/configuracoes");
    revalidatePath("/operador");
  });
}

export async function definirExigirOperador(exigir: boolean, pinAdmin: string | null) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("definir_exigir_operador", { p_exigir: exigir, p_pin_admin: pinAdmin });
    if (error) erroDoBanco(error);
    revalidatePath("/configuracoes");
  });
}

export interface LinhaComissao {
  operadorId: string;
  nome: string;
  vendas: number;
  faturamento: number;
  lucro: number;
  base: "venda" | "lucro";
  pct: number;
  comissao: number;
}

/** Comissão por operador num período (mês). Vendas canceladas não contam; devoluções já reduziram o total. */
export async function calcularComissoes(inicio: string, fim: string) {
  return comResultado(async (): Promise<LinhaComissao[]> => {
    const i = validar(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), inicio);
    const f = validar(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fim);
    const supabase = await createClient();
    const [{ data: ops, error: e1 }, { data: vendas, error: e2 }] = await Promise.all([
      supabase.from("operadores").select("id, nome, comissao_pct, comissao_base"),
      supabase.from("vendas").select("operador_id, total, lucro").not("operador_id", "is", null).neq("status", "cancelada").gte("data_venda", `${i}T00:00:00-03:00`).lte("data_venda", `${f}T23:59:59-03:00`).limit(20000),
    ]);
    if (e1 || e2) throw new Error("Comissões precisam da migração 0063.");
    return (ops ?? [])
      .map((o) => {
        const minhas = (vendas ?? []).filter((v) => v.operador_id === o.id);
        const faturamento = minhas.reduce((s, v) => s + Number(v.total), 0);
        const lucro = minhas.reduce((s, v) => s + Number(v.lucro ?? 0), 0);
        const base = o.comissao_base as "venda" | "lucro";
        const pct = Number(o.comissao_pct);
        return { operadorId: o.id as string, nome: o.nome as string, vendas: minhas.length, faturamento, lucro, base, pct, comissao: Math.round(((base === "lucro" ? Math.max(0, lucro) : faturamento) * pct) / 100 * 100) / 100 };
      })
      .sort((a, b) => b.faturamento - a.faturamento);
  });
}
