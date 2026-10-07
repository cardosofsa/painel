import { MessageCircle } from "lucide-react";
import { linkWhatsappContato, numeroWhatsappContato } from "@/lib/landing";

/**
 * Botão flutuante "Falar no WhatsApp" da landing. Só aparece com
 * `NEXT_PUBLIC_WHATSAPP_CONTATO` (dígitos com DDI). É um link wa.me comum: nada carrega de
 * fora, então a CSP não muda.
 */
export function BotaoWhatsApp({ texto = "Olá! Vim pelo site do Sertão e quero saber mais." }: { texto?: string }) {
  const numero = numeroWhatsappContato(process.env.NEXT_PUBLIC_WHATSAPP_CONTATO);
  if (!numero) return null;
  return (
    <a
      href={linkWhatsappContato(numero, texto)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a gente no WhatsApp"
      title="Falar no WhatsApp"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 rounded-full bg-accent text-accent-on shadow-elev-3 h-12 px-4 font-medium hover:bg-accent-hover"
    >
      <MessageCircle size={20} aria-hidden />
      <span className="hidden sm:inline text-sm">Dúvidas? Chame no WhatsApp</span>
    </a>
  );
}
