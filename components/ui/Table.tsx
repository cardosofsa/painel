import { ReactNode } from "react";

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * Tabela de dados.
 *
 * `.rolagem-lateral` (em `globals.css`) desenha uma sombra nas bordas quando há conteúdo
 * fora da vista. Sem ela, num celular de 360px o usuário vê 2,5 das 9 colunas de Produtos
 * e não tem **nenhum** sinal de que existe mais para o lado.
 */
export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rolagem-lateral ${className}`}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

/**
 * Cabeçalho fixo: com 50 linhas, rolar fazia perder de vista o que era cada coluna.
 * O `z-10` é o que impede as células passarem por cima dele ao rolar.
 */
export function Thead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-2">{children}</thead>;
}

export function Th({
  children,
  align = "left",
  /** Some no celular. Para coluna de apoio numa tabela larga (armazém, código de barras). */
  secundaria = false,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  secundaria?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`text-xs uppercase tracking-wide text-text-tertiary font-medium px-3 py-2.5 border-b border-border whitespace-nowrap ${
        alignClass[align]
      } ${secundaria ? "hidden sm:table-cell" : ""}`}
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
  /** Precisa casar com o `secundaria` do `Th` da mesma coluna. */
  secundaria = false,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  className?: string;
  onClick?: () => void;
  secundaria?: boolean;
}) {
  return (
    <td
      onClick={onClick}
      className={`px-3 py-2.5 border-b border-border text-text-primary ${alignClass[align]} ${
        mono ? "font-mono" : ""
      } ${secundaria ? "hidden sm:table-cell" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  /** Linha marcada por checkbox: o fundo precisa mostrar isso, não só a caixinha. */
  selecionada = false,
}: {
  children: ReactNode;
  selecionada?: boolean;
}) {
  return (
    <tr
      className={`transition-colors duration-[--duracao-rapida] last:[&>td]:border-b-0 ${
        selecionada ? "bg-accent-soft/60" : "hover:bg-surface-2/60"
      }`}
    >
      {children}
    </tr>
  );
}
