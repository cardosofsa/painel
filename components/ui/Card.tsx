import { ReactNode, Ref } from "react";

export function Card({
  children,
  className = "",
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={`rounded-lg bg-surface-1 border border-border shadow-sm p-5 ${className}`}
    >
      {children}
    </div>
  );
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
      <div className={`font-mono text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight ${cor}`}>
        {value}
      </div>
      {caption && (
        <div className="text-sm text-text-secondary mt-1">{caption}</div>
      )}
    </div>
  );
}
