"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Globe, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { textoConcorrente } from "@/lib/copiar";
import type { Concorrente } from "@/lib/ia/prompts-concorrentes";

/**
 * Concorrentes encontrados na web. É uma LISTA PARA CONFERIR: nada é copiado para o anúncio.
 * "Confirmado" = o endereço bate com uma página que a busca de fato consultou; "citado" = o
 * modelo o apontou, abra e confira antes de confiar.
 *
 * Fica numa gaveta dentro do cartão do Título (é para ele que serve), fechada por padrão.
 */
export function PainelConcorrentes({
  concorrentes,
  observacao,
  iaDisponivel,
  ocupado,
  onPesquisar,
}: {
  concorrentes: Concorrente[];
  observacao: string | null;
  iaDisponivel: boolean;
  ocupado: boolean;
  onPesquisar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  // Pesquisa pedida (pelo botão ou pelo assistente): abre a gaveta para o resultado aparecer.
  if (ocupado && !aberto) setAberto(true);
  return (
    <section className="mt-4 border-t border-border pt-3">
      <button type="button" className="flex w-full items-center gap-2 rounded-md py-1 text-left" aria-expanded={aberto} aria-controls="gaveta-concorrentes" onClick={() => setAberto((v) => !v)}>
        <Globe size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-primary">
            Concorrentes na web{concorrentes.length > 0 && <span className="ml-1.5 font-normal text-text-secondary">({concorrentes.length})</span>}
          </span>
          <span className="block text-xs text-text-secondary">O que anúncios parecidos destacam. Referência para o título, nunca para copiar.</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-text-tertiary transition-transform duration-[--duracao-media] ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <div id="gaveta-concorrentes" hidden={!aberto} className="mt-3">
      <Button variant="secondary" onClick={onPesquisar} loading={ocupado} disabled={ocupado || !iaDisponivel}>
        <Globe size={14} aria-hidden /> {concorrentes.length ? "Pesquisar de novo" : "Pesquisar concorrentes"}
      </Button>
      <p className="text-xs text-text-tertiary mt-2 flex gap-1.5">
        <ShieldAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>Usa a busca do Google (só com a IA Gemini) e conta como 1 geração. Páginas de marketplace com login quase nunca aparecem, então o resultado pode vir de outros sites. Sem link, o anúncio não entra na lista.</span>
      </p>

      {observacao && <p className="mt-3 text-sm text-text-secondary">{observacao}</p>}

      {concorrentes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {concorrentes.map((c) => (
            <li key={c.url} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-text-primary break-words flex-1 min-w-0">{c.titulo}</p>
                <span className="flex items-center gap-1">
                  <span className={`text-xs font-medium ${c.confirmado ? "text-positive" : "text-text-tertiary"}`}>{c.confirmado ? "Confirmado nas fontes" : "Citado: confira"}</span>
                  <BotaoCopiar texto={textoConcorrente(c)} rotulo="dados do concorrente" compacto />
                </span>
              </div>
              {c.precoTexto && <p className="text-xs text-text-secondary mt-1">Preço visto na fonte: {c.precoTexto}</p>}
              {c.diferenciais.length > 0 && <p className="text-xs text-text-secondary mt-1">Destaca: {c.diferenciais.join(" · ")}</p>}
              <div className="mt-1.5 flex items-center gap-1">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline break-all">
                  <ExternalLink size={12} aria-hidden /> Abrir o anúncio
                </a>
                <BotaoCopiar texto={c.url} rotulo="link do concorrente" compacto />
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
