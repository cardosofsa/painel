import type { CSSProperties } from "react";
import { LinksLegais } from "@/components/legal/LinksLegais";
import { variaveisCssVitrine } from "@/lib/cores";
import { classeFonte } from "@/lib/fontes-vitrine";
import { buscarAparenciaPublica } from "./dados";

/**
 * Aplica a aparência escolhida pelo dono a toda a vitrine.
 *
 * Não existia layout próprio aqui antes: a vitrine herdava o `app/layout.tsx` raiz, cujo
 * tema (claro/escuro) segue o `localStorage` **do visitante** — ou seja, a aparência da
 * loja dependia de acidente, não de decisão do dono.
 *
 * O truque é reescrever as mesmas variáveis CSS que `app/globals.css` define em `:root`
 * (`--background`, `--surface-1`, `--accent`…), só que como `style` inline nesta `<div>`.
 * O bloco `@theme inline` do Tailwind liga `bg-background`, `text-text-primary` etc. a
 * `var(--background)`/`var(--text-primary)`, então TODO componente já escrito com esses
 * utilitários passa a seguir a cor do dono sem precisar trocar uma classe — inclusive
 * `VitrineView`, `ProdutoPopup` e `CarrinhoVitrine`, que não sabem que isto existe.
 *
 * Sem aparência salva (`aparencia === null`), a `<div>` não define nenhuma variável e a
 * vitrine cai nos tokens padrão do `:root` global — exatamente o comportamento de antes.
 */
export default async function VitrineLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const aparencia = await buscarAparenciaPublica(slug);

  if (!aparencia) return <>{children}<LinksLegais className="py-4" /></>;

  // As variáveis usam os MESMOS nomes que `@theme inline` espera (ver `variaveisCssVitrine`),
  // então nenhum componente da vitrine precisa saber que o tema existe.
  const estiloTokens = variaveisCssVitrine({
    corPrimaria: aparencia.cor_primaria,
    corFundo: aparencia.cor_fundo,
    corSuperficie: aparencia.cor_superficie,
    corTexto: aparencia.cor_texto,
  }) as CSSProperties;

  return (
    <div style={estiloTokens} className={`${classeFonte(aparencia.fonte)} min-h-screen`}>
      {children}
      <LinksLegais className="py-4" />
    </div>
  );
}
