import { redirect } from "next/navigation";

/** A montagem da vitrine pela Vixe mudou para Catálogo › Personalizar (8.7). */
export default function VixeVitrinePage() {
  redirect("/catalogo");
}
