"use client";

import { ExternalLink, Globe, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { textoConcorrente } from "@/lib/copiar";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import type { Concorrente } from "@/lib/ia/prompts-concorrentes";

/**
 * Concorrentes encontrados na web. É uma LISTA PARA CONFERIR: nada é copiado para o anúncio.
 * "Confirmado" = o endereço bate com uma página que a busca de fato consultou; "citado" = o
 * modelo o apontou, abra e confira antes de confiar.
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
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Concorrentes na web</CardTitle>
          <CardSubtitle>A IA pesquisa anúncios parecidos para você ver o que eles destacam. Serve de referência, nunca para copiar.</CardSubtitle>
        </div>
      </CardHeader>

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
    </Card>
  );
}
