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
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Formata um `timestamptz` só com dia e mês, para colunas estreitas. */
export function formatarDataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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
 */
export function numeroOuNulo(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Data local no formato ISO (AAAA-MM-DD), para comparar com colunas `date` e para montar
 * filtros de período. `toISOString()` **não serve aqui**: ele converte para UTC, então
 * depois das 21h (UTC-3) já devolve o dia seguinte.
 */
export function hojeIsoLocal(data = new Date()): string {
  return data.toLocaleDateString("sv-SE");
}
