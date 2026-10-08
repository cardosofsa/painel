/**
 * Despesa fixa não vira conta a pagar: fica em `despesas_fixas` (nome, valor, dia do
 * vencimento) e o pagamento é um lançamento em `movimentacoes_financeiras` com
 * `referencia_despesa_fixa_id`. Para aparecer nos calendários, cada despesa é projetada no
 * dia de vencimento de cada mês do período. Puro; coberto por `despesas-fixas-calendario.test.ts`.
 */

export interface DespesaFixaFonte {
  id: string;
  nome: string;
  valor: number;
  dia_vencimento: number;
  /** Mês de criação: antes dele não há ocorrência. Ausente = sem limite. */
  criado_em?: string | null;
}

/** Lançamento que pagou uma despesa fixa (`referencia_despesa_fixa_id`). */
export interface PagamentoDespesaFixa {
  despesa_id: string;
  data: string;
}

/** Conta a pagar já existente: com a mesma descrição no mesmo mês, a projeção não entra. */
export interface ContaExistente {
  tipo: "pagar" | "receber";
  descricao: string;
  data_vencimento: string;
}

export interface OcorrenciaDespesaFixa {
  id: string;
  despesaId: string;
  descricao: string;
  valor: number;
  /** yyyy-mm-dd */
  data_vencimento: string;
  /** Já tem lançamento dela no mês. */
  paga: boolean;
}

const dd = (n: number) => String(n).padStart(2, "0");
const normalizar = (s: string) => s.trim().toLocaleLowerCase("pt-BR");

/** Ocorrências das despesas fixas entre `inicio` e `fim` (`yyyy-mm-dd`, inclusive). */
export function ocorrenciasDespesasFixas(
  despesas: DespesaFixaFonte[],
  inicio: string,
  fim: string,
  pagamentos: PagamentoDespesaFixa[] = [],
  contas: ContaExistente[] = [],
): OcorrenciaDespesaFixa[] {
  const pagas = new Set(pagamentos.map((p) => `${p.despesa_id}:${p.data.slice(0, 7)}`));
  const existentes = new Set(contas.filter((c) => c.tipo === "pagar").map((c) => `${normalizar(c.descricao)}:${c.data_vencimento.slice(0, 7)}`));
  const saida: OcorrenciaDespesaFixa[] = [];
  let [ano, mes] = inicio.split("-").map(Number);
  const [anoFim, mesFim] = fim.split("-").map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    const chaveMes = `${ano}-${dd(mes)}`;
    const ultimo = new Date(ano, mes, 0).getDate();
    for (const d of despesas) {
      if (d.criado_em && d.criado_em.slice(0, 7) > chaveMes) continue;
      const data = `${chaveMes}-${dd(Math.min(Math.max(1, d.dia_vencimento), ultimo))}`;
      if (data < inicio.slice(0, 10) || data > fim.slice(0, 10)) continue;
      if (existentes.has(`${normalizar(d.nome)}:${chaveMes}`)) continue;
      saida.push({
        id: `fixa:${d.id}:${chaveMes}`,
        despesaId: d.id,
        descricao: d.nome,
        valor: Number(d.valor),
        data_vencimento: data,
        paga: pagas.has(`${d.id}:${chaveMes}`),
      });
    }
    if (++mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return saida;
}
