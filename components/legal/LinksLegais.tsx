import Link from "next/link";

/** Rodapé discreto com os links das páginas legais (login, cadastro e vitrine pública). */
export function LinksLegais({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-text-tertiary text-center ${className}`}>
      <Link href="/privacidade" className="hover:underline">
        Privacidade
      </Link>
      {" · "}
      <Link href="/termos" className="hover:underline">
        Termos
      </Link>
    </p>
  );
}
