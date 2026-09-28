/**
 * `<img>` para arquivo que mora no Supabase Storage.
 *
 * ## Por que não é `next/image`
 *
 * O otimizador do Next precisa que o domínio esteja declarado em `next.config.ts`, e
 * reescreve a URL para `/_next/image`. Nada disso ajuda aqui: as fotos vêm do bucket
 * público do Supabase, a vitrine é servida fora do domínio de otimização, e declarar o
 * domínio faria o servidor do app buscar e reprocessar cada imagem — custo de banda e
 * de função sem ganho, já que o Storage já entrega por CDN.
 *
 * ## Por que existe um componente
 *
 * A mesma `<img>` com o mesmo `eslint-disable` estava repetida em 8 lugares. Concentrar
 * deixa o desvio da regra em **um** ponto, com a justificativa escrita uma vez — e dá um
 * lugar único para, no futuro, acrescentar `onError`, placeholder ou `srcset`.
 */
export function ImagemStorage({
  src,
  alt,
  className = "",
  /**
   * Imagem principal, visível antes de qualquer rolagem (a foto grande do popup de
   * produto). `loading="lazy"` nela atrasa justamente o que o visitante veio ver.
   */
  prioridade = false,
}: {
  src: string;
  alt: string;
  className?: string;
  prioridade?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver o cabeçalho do arquivo
    <img
      src={src}
      alt={alt}
      loading={prioridade ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}
