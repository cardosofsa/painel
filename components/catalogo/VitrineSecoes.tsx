import { MessageCircle } from "lucide-react";
import type { SecoesVitrine } from "@/lib/vixe/vitrine";

/**
 * Seções da vitrine montadas pela Vixe (7.9). Componentes FIXOS: a configuração só traz
 * texto, e todo texto é renderizado como texto (o React escapa), nunca como HTML.
 * Sem hooks, então serve tanto na vitrine pública (servidor) quanto na prévia (cliente).
 */
export function DestaqueVitrine({ secoes }: { secoes: SecoesVitrine }) {
  if (!secoes.destaque) return null;
  return (
    <section className="rounded-lg bg-accent-soft border border-border px-5 py-6 sm:px-8 sm:py-8 mb-6">
      <h2 className="text-xl sm:text-2xl font-semibold text-text-primary leading-tight">{secoes.destaque.titulo}</h2>
      {secoes.destaque.subtitulo && <p className="text-sm sm:text-base text-text-secondary mt-2">{secoes.destaque.subtitulo}</p>}
    </section>
  );
}

function linkWhatsapp(numero: string | null): string | null {
  const d = numero?.replace(/\D/g, "");
  return d ? `https://wa.me/${d.startsWith("55") ? d : `55${d}`}` : null;
}

export function SecoesFinaisVitrine({ secoes, whatsapp }: { secoes: SecoesVitrine; whatsapp: string | null }) {
  const zap = linkWhatsapp(whatsapp);
  if (!secoes.sobre && !secoes.diferenciais?.length && !secoes.chamada && !secoes.rodape) return null;
  return (
    <div className="mt-10 space-y-6">
      {secoes.diferenciais?.length ? (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {secoes.diferenciais.map((d) => (
            <div key={d.titulo} className="rounded-lg bg-surface-1 border border-border p-4">
              <h3 className="text-sm font-semibold text-accent">{d.titulo}</h3>
              <p className="text-sm text-text-secondary mt-1">{d.texto}</p>
            </div>
          ))}
        </section>
      ) : null}

      {secoes.sobre && (
        <section className="rounded-lg bg-surface-1 border border-border p-5">
          <h3 className="text-base font-semibold text-text-primary mb-1.5">Sobre nós</h3>
          <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{secoes.sobre.texto}</p>
        </section>
      )}

      {secoes.chamada && (
        <section className="rounded-lg bg-accent text-accent-on p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm sm:text-base font-medium">{secoes.chamada.texto}</p>
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-on text-accent text-sm font-medium px-4 py-2 shrink-0"
            >
              <MessageCircle size={15} /> Falar no WhatsApp
            </a>
          )}
        </section>
      )}

      {secoes.rodape && <p className="text-center text-xs text-text-tertiary">{secoes.rodape.texto}</p>}
    </div>
  );
}
