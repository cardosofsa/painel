import { redirect } from "next/navigation";

/** O Padrão da loja agora mora nas Configurações do Anúncio Infinito. */
export default function MarcaPage() {
  redirect("/anuncio/infinito?config=perfil");
}
