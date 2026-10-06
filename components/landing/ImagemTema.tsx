import Image from "next/image";

/**
 * Captura da landing nos dois temas: quem usa o modo noturno vê o sistema escuro, não um
 * retângulo branco no meio da página. `{src}.webp` é o claro e `{src}-escuro.webp` o escuro.
 * Só a do tema ativo aparece; a outra fica `display: none` e, sendo `lazy`, nem baixa.
 */
export function ImagemTema({
  src,
  alt,
  width,
  height,
  prioridade = false,
  className = "w-full h-auto",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  prioridade?: boolean;
  className?: string;
}) {
  return (
    <>
      <Image src={`${src}.webp`} alt={alt} width={width} height={height} priority={prioridade} className={`${className} dark:hidden`} />
      <Image src={`${src}-escuro.webp`} alt={alt} width={width} height={height} className={`${className} hidden dark:block`} />
    </>
  );
}
