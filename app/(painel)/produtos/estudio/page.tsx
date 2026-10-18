import { redirect } from "next/navigation";

/** O Estúdio de anúncios virou o Anúncio Infinito; links antigos (com ?produto=) continuam valendo. */
export default async function EstudioPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  redirect(produto ? `/anuncio/infinito?produto=${encodeURIComponent(produto)}` : "/anuncio/infinito");
}
