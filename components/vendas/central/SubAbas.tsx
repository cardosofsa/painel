"use client";

/** Sub-abas de uma etapa (como no ERP): Para Reservar por motivo, Para Enviar por estado do envio. */
export function SubAbas<T extends string>({
  itens,
  valor,
  onChange,
}: {
  /** `n` = contagem ao lado do rótulo (opcional). */
  itens: { id: T; rotulo: string; n?: number }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          aria-pressed={valor === i.id}
          onClick={() => onChange(i.id)}
          className={`text-xs rounded-md border px-2.5 py-1.5 ${valor === i.id ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
        >
          {i.rotulo}
          {i.n !== undefined && <span className="font-mono"> {i.n}</span>}
        </button>
      ))}
    </div>
  );
}
