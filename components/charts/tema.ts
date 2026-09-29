/**
 * Aparência compartilhada dos gráficos.
 *
 * Existe porque os seis gráficos repetiam o mesmo `contentStyle` de tooltip, o mesmo
 * `tick` de eixo e a mesma sombra escrita à mão — e todos pintavam a série de índigo
 * `#4f46e5`, uma cor que não existe em nenhum outro lugar do sistema. Como eles ocupam a
 * área nobre do Dashboard, de Vendas, do Financeiro e da Precificação, metade das telas
 * abria parecendo um produto de outra marca.
 *
 * Tudo aqui é `var(--token)`. O Recharts renderiza SVG inline no DOM, então a variável
 * resolve contra o tema em vigor e o gráfico **acompanha a troca de tema sozinho** — sem
 * `useEffect` lendo `getComputedStyle`, sem re-render.
 */

/** Série única: é a cor da marca. */
export const COR_SERIE = "var(--accent)";

/** Entradas e saídas de caixa. Semântico, não categórico — segue o resto do sistema. */
export const COR_POSITIVA = "var(--positive)";
export const COR_NEGATIVA = "var(--negative)";

/**
 * Escala categórica, em ordem fixa. Nunca é ciclada: uma quinta fatia vira "Outros".
 *
 * Validada por cálculo (faixa de luminosidade, piso de croma, separação sob protanopia e
 * deuteranopia, piso de visão normal, contraste contra a superfície), em cada tema
 * separadamente — os passos do tema escuro são outros valores das mesmas famílias de
 * matiz, porque clarear os do claro reprova na faixa de luminosidade.
 */
export const CORES_CATEGORICAS = [
  "var(--grafico-1)",
  "var(--grafico-2)",
  "var(--grafico-3)",
  "var(--grafico-4)",
] as const;

/** Tooltip. `--sombra-2` é o nível de popover; antes era um `rgba` preto fixo. */
export const ESTILO_TOOLTIP = {
  fontSize: 12,
  borderRadius: "var(--radius)",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  boxShadow: "var(--sombra-2)",
  padding: "8px 10px",
} as const;

export const ESTILO_ROTULO_TOOLTIP = { color: "var(--text-primary)", fontWeight: 500 } as const;

/** Eixo recessivo: o dado é que tem que saltar, não a régua. */
export const TICK_EIXO = { fontSize: 11, fill: "var(--text-tertiary)" } as const;

/** Cursor da barra em hover. */
export const CURSOR_BARRA = { fill: "var(--surface-2)" } as const;

export const formatarMoedaTooltip = (valor: unknown) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
