import { ReactNode } from "react";

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-2/60">{children}</thead>;
}

export function Th({
  children,
  align = "left",
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={`text-xs uppercase tracking-wide text-text-tertiary font-medium px-3 py-2.5 border-b border-border ${alignClass[align]}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  className = "",
  onClick,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <td
      onClick={onClick}
      className={`px-3 py-2.5 border-b border-border text-text-primary ${alignClass[align]} ${
        mono ? "font-mono" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-surface-2/40 last:[&>td]:border-b-0">{children}</tr>;
}
