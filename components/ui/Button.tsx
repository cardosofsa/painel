import { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "destructive";

const base =
  "inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-on hover:bg-accent-hover shadow-sm",
  secondary:
    "bg-surface-1 border border-border text-text-primary hover:bg-surface-2 shadow-sm",
  destructive:
    "bg-transparent border border-negative/30 text-negative hover:bg-negative-soft",
};

export function Button({
  variant = "primary",
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
