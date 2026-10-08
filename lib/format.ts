/**
 * Fuso de quem usa o sistema. O servidor (Vercel) roda em UTC e o navegador no horário de
 * Brasília: sem fuso explícito, o mesmo instante sai com 3 horas de diferença entre o HTML
 * do servidor e o do cliente (erro de hidratação), e o "hoje" do servidor vira o dia
 * seguinte depois das 21h.
 */
export const FUSO_HORARIO = "America/Sao_Paulo";

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Formata uma coluna `date` do Postgres ("2026-01-01").
 *
 * O `+ "T00:00:00"` é obrigatório: `new Date("2026-01-01")` é interpretado como meia-noite
 * **UTC**, e no Brasil (UTC-3) isso renderiza 31/12/2025 — um dia antes. Com o sufixo, a
 * string é lida como meia-noite local e a data sai correta.
 */
export function formatarDataIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dataLocal(iso).toLocaleDateString("pt-BR");
}

/**
 * Converte uma coluna `date` do Postgres em `Date` no fuso local, para quem precisa
 * **calcular** com ela (diferença de dias, comparação de mês) e não só exibir.
 *
 * Existe porque o `new Date(iso + "T00:00:00")` estava copiado cru em seis telas, ao lado
 * de um `formatarDataIso` que documenta o motivo do sufixo. Bastava uma cópia perder o
 * `T00:00:00` para o bug de "um dia a menos" voltar — e ele já voltou antes.
 */
export function dataLocal(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** Formata um `timestamptz` (que já carrega fuso) com data e hora. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: FUSO_HORARIO });
}

/**
 * Formata um `timestamptz` só com a data (dd/mm/aaaa) no horário de Brasília. Sem o fuso,
 * o servidor (UTC) e o navegador montavam dias diferentes depois das 21h e o React acusava
 * erro de hidratação.
 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO_HORARIO });
}

/** Formata um `timestamptz` só com dia e mês, para colunas estreitas. */
export function formatarDataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO_HORARIO });
}

/**
 * Margem em percentual, com o sinal correto.
 *
 * Vários lugares imprimiam um `+` fixo e pintavam de verde, então um lucro de −R$ 5 saía
 * como "+-5.0%" em verde — prejuízo apresentado como lucro. Use junto com `classeValor`.
 */
export function formatarMargemPct(lucro: number, preco: number): string {
  if (!Number.isFinite(lucro) || !Number.isFinite(preco) || preco <= 0) return "0,0%";
  const pct = (lucro / preco) * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")}%`;
}

/** Verde para número não-negativo, vermelho para negativo. */
export function classeValor(valor: number): string {
  return valor >= 0 ? "text-positive" : "text-negative";
}

/**
 * Converte o que o usuário digitou em número, aceitando vírgula como separador decimal —
 * que é como um brasileiro escreve "19,90". Devolve `null` para vazio ou para qualquer
 * coisa que não vire número finito.
 *
 * Existe porque `Number("19,90")` devolve `NaN`, e `NaN` é traiçoeiro: `??` não o captura,
 * `NaN <= 0` é `false`, e `JSON.stringify(NaN)` vira `null`. Um NaN nascido num input
 * chegava até o INSERT sem que nenhum guard no caminho o percebesse.
 *
 * Ponto de milhar: com vírgula na string, todo ponto é milhar ("1.500,00" → 1500). Sem
 * vírgula, ponto seguido de grupos de exatamente 3 dígitos também é milhar ("1.500" → 1500,
 * "12.345.678" → 12345678) — antes "1.500" virava 1,5. Qualquer outro ponto continua
 * decimal ("19.90" → 19,9; "1.5" → 1,5; "0.500" → 0,5).
 */
export function numeroOuNulo(valor: string): number | null {
  const limpo = normalizarNumeroDigitado(valor.trim());
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function normalizarNumeroDigitado(texto: string): string {
  if (texto.includes(",")) return texto.replace(/\./g, "").replace(",", ".");
  if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(texto)) return texto.replace(/\./g, "");
  return texto;
}

/**
 * Data local no formato ISO (AAAA-MM-DD), para comparar com colunas `date` e para montar
 * filtros de período. `toISOString()` **não serve aqui**: ele converte para UTC, então
 * depois das 21h (UTC-3) já devolve o dia seguinte.
 */
export function hojeIsoLocal(data = new Date()): string {
  return data.toLocaleDateString("sv-SE");
}

/**
 * Hoje (AAAA-MM-DD) no horário de Brasília, valha onde o código rodar. Use no SERVIDOR
 * sempre que o "hoje" for o agora: lá `hojeIsoLocal()` lê o fuso da máquina (UTC), e
 * depois das 21h uma conta que vence amanhã aparecia como vencendo hoje.
 *
 * Só para instantes (o `new Date()` de agora, um `timestamptz`). Uma meia-noite montada
 * com `new Date(ano, mês, dia)` continua indo para `hojeIsoLocal`: convertida de fuso,
 * ela recuaria para a véspera.
 */
export function hojeIsoBrasil(agora = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: FUSO_HORARIO });
}

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * O instante da meia-noite de Brasília numa data AAAA-MM-DD, para comparar com `timestamptz`
 * no SERVIDOR (lá `setHours(0)` é a meia-noite UTC, 21h da véspera no Brasil). O Brasil não
 * tem horário de verão desde 2019: o fuso é sempre −03:00.
 */
export function inicioDiaBrasil(iso: string = hojeIsoBrasil()): Date {
  return new Date(`${iso}T00:00:00-03:00`);
}

/** Hora (0–23) de um instante no horário de Brasília, não no do processo. */
export function horaBrasil(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: FUSO_HORARIO }).format(d));
}
