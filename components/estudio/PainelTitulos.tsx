"use client";

import { useState } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import type { TitulosDoEstudio } from "@/app/(painel)/produtos/estudio/actions";

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
}: {
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
          <CardTitle>1. Título</CardTitle>
          <CardSubtitle>A porta de entrada: é o que aparece na busca. Limite da plataforma: {limite} caracteres.</CardSubtitle>
        </div>
      </CardHeader>

      {titulo && (
        <p className="mb-3 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-primary" aria-live="polite">
          <Check size={14} className="inline mr-1 text-positive" aria-hidden />
          <strong>Título escolhido:</strong> {titulo} <span className="text-text-tertiary">({titulo.length}/{limite})</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <input className={`${inputClass} flex-1 min-w-[12rem]`} value={pedido} maxLength={300} onChange={(e) => setPedido(e.target.value)} placeholder="Pedido opcional: mais curto, destacar o kit…" aria-label="Pedido para os títulos" />
        <Button variant="secondary" onClick={() => onGerar(pedido.trim() || null)} loading={ocupado} disabled={ocupado || !iaDisponivel}>
          <Sparkles size={14} /> {resultado ? "Gerar outros" : "Gerar 5 títulos"}
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
                  <Button size="sm" variant={v.utilizavel ? "primary" : "ghost"} disabled={!v.utilizavel || ocupado} onClick={() => onEscolher(v.titulo)}>
                    Usar este
                  </Button>
                </div>
                {v.violacoes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {v.violacoes.map((x) => (
                      <li key={x.termo} className="flex gap-1.5 text-xs text-text-secondary">
                        <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${x.gravidade === "bloquear" ? "text-negative" : ""}`} aria-hidden />
                        {x.gravidade === "bloquear" ? "Evite" : "Revise"}: “{x.trecho}” — {x.motivo.toLowerCase()}.
                      </li>
                    ))}
                  </ul>
                )}
                {v.caracteres > limite && <p className="mt-2 text-xs text-negative">Passa do limite de {limite} caracteres.</p>}
              </li>
            ))}
          </ul>
          {resultado.palavrasChave.length > 0 && <p className="text-xs text-text-secondary mb-3">Palavras-chave sugeridas: {resultado.palavrasChave.join(", ")}.</p>}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} flex-1 min-w-[12rem]`} value={manual} maxLength={200} onChange={(e) => setManual(e.target.value)} placeholder="Ou digite o seu título" aria-label="Título digitado" />
        <Button variant="ghost" onClick={() => onEscolher(manual.trim())} disabled={ocupado || manual.trim().length < 3}>
          Usar o meu
        </Button>
      </div>
    </Card>
  );
}
