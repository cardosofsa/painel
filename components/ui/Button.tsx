import { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "sm" | "md";

/**
 * O `focus-visible` global de `globals.css` já desenha o anel; aqui só garantimos que o
 * `outline-none` de nenhum reset o apague.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-colors duration-[--duracao-rapida] disabled:opacity-50 disabled:pointer-events-none";

/**
 * `sm` é a altura de filtro e de chip; `md` é a de ação.
 *
 * Sem uma prop de tamanho, a tela inventava a sua: `ProdutosClient` tinha duas fileiras de
 * filtro, uma embaixo da outra, com `h-9 px-3 rounded-md` numa e `h-7 px-2.5 rounded-full`
 * na outra. Eram 113 `<button>` crus contra 133 `<Button>`.
 */
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-3.5 text-sm",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-on hover:bg-accent-hover shadow-elev-1",
  secondary: "bg-surface-1 border border-border text-text-primary hover:bg-surface-2 hover:border-border-forte shadow-elev-1",
  destructive: "bg-transparent border border-negative/40 text-negative hover:bg-negative-soft hover:border-negative",
  /** Ação terciária: sem contorno até o hover. Para ícone solto e link de tabela. */
  ghost: "bg-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Botão só com ícone.
 *
 * `aria-label` é **obrigatório** no tipo: sem texto, é a única coisa que um leitor de tela
 * anuncia. Sete botões de ícone no projeto estavam sem ele — as setas de mês da agenda, as
 * lixeiras da precificação, o "Recolher" da sidebar quando encolhida.
 *
 * 36px de lado no celular (`max-sm:`) porque alvo de toque menor que isso erra o dedo; no
 * desktop, onde o ponteiro é preciso, fica compacto.
 */
export function IconButton({
  variant = "ghost",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; "aria-label": string }) {
  return (
    <button
      className={`${base} ${variants[variant]} h-8 w-8 max-sm:h-9 max-sm:w-9 shrink-0 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
