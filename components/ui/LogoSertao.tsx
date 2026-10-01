import Image from "next/image";

/**
 * Símbolo do SERTÃO (o S com sol e cacto), em `public/marca/`. Fundo transparente: serve
 * no tema claro e no escuro. Para o ícone do app e o favicon, ver `app/icon.png`.
 */
export function LogoSertao({ tamanho = 28, className = "", prioridade = false }: { tamanho?: number; className?: string; prioridade?: boolean }) {
  return (
    <Image
      src={tamanho <= 48 ? "/marca/sertao-192.png" : "/marca/sertao.png"}
      alt="SERTÃO"
      width={tamanho}
      height={tamanho}
      priority={prioridade}
      className={`shrink-0 select-none ${className}`}
    />
  );
}
