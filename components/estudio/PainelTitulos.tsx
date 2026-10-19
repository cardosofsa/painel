"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { textoPalavrasChave } from "@/lib/copiar";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import type { TitulosDoEstudio } from "@/app/(painel)/produtos/estudio/actions";
import { numeroDaEtapa } from "@/lib/anuncio/etapas";

/**
 * Títulos: cinco variantes, cada uma com nota (sem IA), contagem de caracteres e conferência de
 * termos. O usuário escolhe uma ou digita a dele; o escolhido passa pela mesma conferência no
 * servidor antes de virar o título do anúncio.
 */
export function PainelTitulos({
  titulo,
  limite,
  resultado,
  iaDisponivel,
  ocupado,
  onGerar,
  onEscolher,
  onPendente,
  usados = [],
  children,
}: {
  /** Gaveta embaixo do cartão (os concorrentes, que servem ao título). */
  children?: ReactNode;
  /** Títulos já usados nas precificações deste produto. */
  usados?: string[];
  /** O título digitado e ainda não usado (ou `null`), para a proteção de saída da tela. */
  onPendente?: (texto: string | null) => void;
  titulo: string | null;
  limite: number;
  resultado: TitulosDoEstudio | null;
  iaDisponivel: boolean;
  ocupado: boolean;
  onGerar: (pedido: string | null) => void;
  onEscolher: (titulo: string) => void;
}) {
  const [pedido, setPedido] = useState("");
  const [manual, setManual] = useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{numeroDaEtapa("titulo")}. Título</CardTitle>
          <CardSubtitle>A porta de entrada: é o que aparece na busca. Limite da plataforma: {limite} caracteres.</CardSubtitle>
        </div>
      </CardHeader>

      {titulo && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-primary" aria-live="polite">
          <p className="min-w-0">
            <Check size={14} className="inline mr-1 text-positive" aria-hidden />
            <strong>Título escolhido:</strong> {titulo} <span className="text-text-tertiary">({titulo.length}/{limite})</span>
          </p>
          <BotaoCopiar texto={titulo} rotulo="título escolhido" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <input className={`${inputClass} flex-1 min-w-[12rem]`} value={pedido} maxLength={300} onChange={(e) => setPedido(e.target.value)} placeholder="Pedido opcional: mais curto, destacar o kit…" aria-label="Pedido para os títulos" />
        <Button variant="secondary" onClick={() => onGerar(pedido.trim() || null)} loading={ocupado} disabled={ocupado || !iaDisponivel}>
          <Sparkles size={14} aria-hidden /> {resultado ? "Gerar outros" : "Gerar 5 títulos"}
        </Button>
      </div>
      {!iaDisponivel && <p className="text-xs text-text-tertiary mb-3">Configure uma IA em Configurações para gerar títulos. Você pode digitar o seu abaixo.</p>}

      {resultado && (
        <>
          <p className="text-xs text-text-tertiary mb-2">{resultado.doCache ? "Resposta guardada (não gastou cota)." : `Geração ${resultado.usadas} de ${resultado.limite} de hoje.`} A nota é local (sem IA): termo de busca no começo, uso do espaço, sem repetição e sem enfeite.</p>
          <ul className="space-y-2 mb-3">
            {resultado.variantes.map((v) => (
              <li key={v.titulo} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary break-words">{v.titulo}</p>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {v.angulo && <>{v.angulo} · </>}
                      {v.caracteres}/{limite} caracteres · nota {v.nota.nota}/100
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <BotaoCopiar texto={v.titulo} rotulo="este título" />
                    <Button size="sm" variant={v.utilizavel ? "primary" : "ghost"} disabled={!v.utilizavel || ocupado} onClick={() => onEscolher(v.titulo)}>
                      Usar este
                    </Button>
                  </div>
                </div>
                {v.violacoes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {v.violacoes.map((x) => (
                      <li key={x.termo} className="flex gap-1.5 text-xs text-text-secondary">
                        <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${x.gravidade === "bloquear" ? "text-negative" : ""}`} aria-hidden />
                        {x.gravidade === "bloquear" ? "Bloqueia" : "Revise"}: “{x.trecho}” — {x.motivo.toLowerCase()}.
                      </li>
                    ))}
                  </ul>
                )}
                {v.caracteres > limite && <p className="mt-2 text-xs text-negative">Passa do limite de {limite} caracteres.</p>}
              </li>
            ))}
          </ul>
          {resultado.palavrasChave.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2 text-xs text-text-secondary">
              <p className="min-w-0">Palavras-chave sugeridas: {textoPalavrasChave(resultado.palavrasChave)}.</p>
              <BotaoCopiar texto={textoPalavrasChave(resultado.palavrasChave)} rotulo="palavras-chave" />
            </div>
          )}
        </>
      )}

      {usados.filter((t) => t !== titulo).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-text-secondary mb-1.5">Títulos que você já usou</h4>
          <ul className="space-y-1.5">
            {usados
              .filter((t) => t !== titulo)
              .map((t) => (
                <li key={t} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-text-primary min-w-0 break-words">
                    {t} <span className="text-xs text-text-tertiary">({t.length}/{limite})</span>
                  </span>
                  <Button size="sm" variant="ghost" disabled={ocupado || t.length > limite} onClick={() => onEscolher(t)}>
                    Usar este
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} flex-1 min-w-[12rem]`} value={manual} maxLength={200} onChange={(e) => {
            setManual(e.target.value);
            onPendente?.(e.target.value.trim() ? e.target.value : null);
          }}
          placeholder="Ou digite o seu título" aria-label="Título digitado" />
        <Button variant="ghost" onClick={() => {
            onPendente?.(null);
            onEscolher(manual.trim());
          }} disabled={ocupado || manual.trim().length < 3}>
          Usar o meu
        </Button>
      </div>
      {children}
    </Card>
  );
}
