import { ReactNode, Ref } from "react";

type Padding = "normal" | "compacto" | "nenhum";
type Elevacao = 0 | 1 | 2;

const PADDINGS: Record<Padding, string> = {
  normal: "p-5",
  compacto: "p-4",
  /** Para card que contém tabela ou lista que sangra até a borda. Use com `CardHeader`. */
  nenhum: "",
};

const ELEVACOES: Record<Elevacao, string> = {
  0: "",
  1: "shadow-elev-1",
  2: "shadow-elev-2",
};

/**
 * Superfície padrão.
 *
 * `padding="nenhum"` existe porque 19 telas passavam `className="p-0"` para poder pôr uma
 * tabela dentro — e aí cada uma reconstruía o cabeçalho à mão, com `pb-3` numa, `pb-4`
 * noutra e `pb-5` na terceira. `CardHeader` resolve o outro lado desse problema.
 *
 * A sombra vem de token por tema (`--sombra-1`): a `shadow-sm` do Tailwind é preta
 * translúcida e, no tema escuro, não produzia elevação nenhuma sobre fundo preto.
 */
export function Card({
  children,
  className = "",
  padding = "normal",
  elevacao = 1,
  ref,
}: {
  children: ReactNode;
  className?: string;
  padding?: Padding;
  elevacao?: Elevacao;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={`rounded-lg bg-surface-1 border border-border ${ELEVACOES[elevacao]} ${PADDINGS[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Cabeçalho de um `Card padding="nenhum"`. Um único recuo para todos, em vez dos três
 * que existiam espalhados.
 */
export function CardHeader({
  children,
  acoes,
  className = "",
}: {
  children: ReactNode;
  /** Botão, filtro ou link alinhado à direita. */
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4 ${className}`}>
      <div className="min-w-0">{children}</div>
      {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  );
}

/**
 * Título de card.
 *
 * Existe porque o mesmo nível hierárquico aparecia de três jeitos — `text-base
 * font-semibold` (18×), `font-semibold` sem tamanho (5×) e `text-sm font-medium` (7×).
 */
export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-base font-semibold text-text-primary tracking-tight ${className}`}>{children}</h2>;
}

/** Linha de apoio logo abaixo do título. */
export function CardSubtitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-text-secondary mt-1 ${className}`}>{children}</p>;
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-medium tracking-wide text-text-tertiary uppercase mb-2">
      {children}
    </div>
  );
}

export function HeroMetric({
  value,
  caption,
  accent = false,
  /**
   * Para métrica que pode ficar negativa (resultado do mês, saldo projetado). Passe o
   * número: negativo é pintado de vermelho e `accent` é ignorado — senão um mês no
   * prejuízo apareceria na cor de destaque, que o olho lê como coisa boa.
   */
  valorNumerico,
}: {
  value: string;
  caption?: string;
  accent?: boolean;
  valorNumerico?: number;
}) {
  const negativo = valorNumerico !== undefined && valorNumerico < 0;
  const cor = negativo ? "text-negative" : accent ? "text-accent" : "text-text-primary";
  return (
    <div>
      <div className={`font-mono text-2xl sm:text-3xl font-semibold tracking-tight ${cor}`}>
        {value}
      </div>
      {caption && <div className="text-sm text-text-secondary mt-1.5">{caption}</div>}
    </div>
  );
}
