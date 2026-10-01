import { corDaTag } from "@/lib/expedicao";

/** Paleta fixa (claro/escuro pelos tokens): a mesma tag sempre na mesma cor. */
const CORES = [
  "bg-accent-soft text-accent",
  "bg-positive-soft text-positive",
  "bg-negative-soft text-negative",
  "bg-surface-2 text-text-primary",
  "bg-[color-mix(in_oklab,var(--grafico-2)_18%,transparent)] text-text-primary",
  "bg-[color-mix(in_oklab,var(--grafico-3)_18%,transparent)] text-text-primary",
];

export function TagPedido({ tag }: { tag: string }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${CORES[corDaTag(tag)]}`}>{tag}</span>;
}
