import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompromissoFonte, ContaFonte, DataPropriaFonte } from "./calendario-dashboard";

export interface FontesPeriodo {
  compromissos: CompromissoFonte[];
  contas: ContaFonte[];
  datasProprias: DataPropriaFonte[];
  /** false = 0068 ausente: o calendário funciona, sem "cidade e loja". */
  datasOk: boolean;
}

/**
 * Tudo o que o calendário do Dashboard mostra num período (`yyyy-mm-dd`, inclusive), menos
 * o que é calculado no código (feriados e datas do comércio). Código de SERVIDOR: roda com o
 * cliente do Supabase da sessão, então o RLS escolhe as linhas da conta.
 */
export async function carregarFontesPeriodo(supabase: SupabaseClient, inicio: string, fim: string): Promise<FontesPeriodo> {
  const [compromissosRes, contasRes, parcelasRes, datasRes] = await Promise.all([
    supabase.from("compromissos").select("id, titulo, data, hora, descricao").gte("data", inicio).lte("data", fim).order("data").order("hora"),
    // `*`: valor_pago só a partir da 0064.
    supabase.from("contas_a_pagar_receber").select("*, vendas(total_parcelas_fiado)").eq("status", "pendente").gte("data_vencimento", inicio).lte("data_vencimento", fim).limit(1000),
    // Crediário parcelado (0030): a conta "pai" fica fora da lista acima por ser a soma das parcelas.
    supabase
      .from("venda_parcelas")
      .select("id, numero, total_parcelas, valor, valor_pago, data_vencimento, vendas(numero, cliente_nome, status)")
      .eq("status", "pendente")
      .gte("data_vencimento", inicio)
      .lte("data_vencimento", fim)
      .limit(1000),
    // Poucas linhas e repetem todo ano: vêm todas, o filtro do mês é no código.
    supabase.from("datas_calendario").select("id, titulo, data, repete_todo_ano, tipo, observacao").order("data").limit(500),
  ]);
  if (compromissosRes.error) throw new Error(compromissosRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);

  type Cpr = { aguardando_liberacao?: boolean | null; id: string; tipo: "pagar" | "receber"; descricao: string; valor: number; valor_pago?: number | null; data_vencimento: string; referencia_venda_id: string | null; vendas: { total_parcelas_fiado: number | null } | null };
  type Parcela = { id: string; numero: number; total_parcelas: number; valor: number; valor_pago: number | null; data_vencimento: string; vendas: { numero: string; cliente_nome: string | null; status: string } | null };
  const parcelas = (parcelasRes.error ? [] : (parcelasRes.data ?? [])) as unknown as Parcela[];
  const contas: ContaFonte[] = [
    ...parcelas
      .filter((p) => p.vendas?.status !== "cancelada")
      .map((p) => ({
        id: p.id,
        tipo: "receber" as const,
        descricao: `Venda ${p.vendas?.numero ?? ""} — parcela ${p.numero}/${p.total_parcelas}${p.vendas?.cliente_nome ? ` · ${p.vendas.cliente_nome}` : ""}`,
        valor: Number(p.valor) - Number(p.valor_pago ?? 0),
        data_vencimento: p.data_vencimento,
      })),
    ...((contasRes.data ?? []) as Cpr[])
      // A conta "pai" de uma venda parcelada é a soma das parcelas: aparece pelas parcelas.
      // Repasse de marketplace aguardando a conclusão do pedido (0085) não tem data ainda.
      .filter((c) => (c.vendas?.total_parcelas_fiado ?? 1) <= 1 && !c.aguardando_liberacao)
      .map((c) => ({ id: c.id, tipo: c.tipo, descricao: c.descricao, valor: Number(c.valor) - Number(c.valor_pago ?? 0), data_vencimento: c.data_vencimento })),
  ].filter((c) => c.valor > 0.004);

  return {
    compromissos: (compromissosRes.data ?? []) as CompromissoFonte[],
    contas,
    datasProprias: datasRes.error ? [] : ((datasRes.data ?? []) as DataPropriaFonte[]),
    datasOk: !datasRes.error,
  };
}

/** UF dos feriados estaduais: a escolhida no calendário (0068) ou a do endereço da empresa. */
export async function ufDoCalendario(supabase: SupabaseClient): Promise<string | null> {
  // `*`: calendario_uf só a partir da 0068.
  const { data } = await supabase.from("perfil_negocio").select("*").maybeSingle();
  const p = data as Record<string, unknown> | null;
  const uf = String(p?.calendario_uf ?? p?.uf ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
}
