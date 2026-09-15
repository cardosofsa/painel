import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
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
}: {
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-mono text-3xl font-semibold tracking-tight ${
          accent ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {caption && (
        <div className="text-sm text-text-secondary mt-1">{caption}</div>
      )}
    </div>
  );
}
