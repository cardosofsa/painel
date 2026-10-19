"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { haQuanto, type RascunhoPendente } from "@/lib/precificacao-rascunho";

/** "Continuar rascunho: Kit Chá (há 2 h)" com Continuar e Descartar. */
export function AvisoRascunho({ pendente, onContinuar, onDescartar }: { pendente: RascunhoPendente; onContinuar: () => void; onDescartar: () => void }) {
  return (
    <Card className="mb-5 border-accent/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-primary min-w-0">
          Continuar rascunho: <strong>{pendente.titulo || "Sem nome"}</strong> <span className="text-text-secondary">({haQuanto(pendente.atualizado_em)})</span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={onContinuar}>
            Continuar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDescartar}>
            Descartar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** "Rascunho salvo há 3 s": refaz o texto a cada 5 s, sem tocar no resto da tela. */
export function IndicadorRascunho({ sujo, salvando, salvoEm, semMigracao }: { sujo: boolean; salvando: boolean; salvoEm: string | null; semMigracao: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);
  const texto = semMigracao
    ? "Rascunho automático indisponível (falta a migração 0100)"
    : salvando
      ? "Salvando rascunho…"
      : sujo
        ? "Alterações ainda não salvas"
        : salvoEm
          ? `Rascunho salvo ${haQuanto(salvoEm, agora)}`
          : "";
  if (!texto) return null;
  return (
    <span className="text-xs text-text-tertiary" aria-live="polite">
      {texto}
    </span>
  );
}

/** Indicador + "Salvar rascunho", para o rodapé das abas Variações, Kits e Em Massa. */
export function BarraRascunho({ rasc, temConteudo }: { rasc: { sujo: boolean; salvando: boolean; salvoEm: string | null; semMigracao: boolean; salvarRascunho: () => Promise<boolean> }; temConteudo: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <IndicadorRascunho sujo={rasc.sujo} salvando={rasc.salvando} salvoEm={rasc.salvoEm} semMigracao={rasc.semMigracao} />
      <Button size="sm" variant="secondary" onClick={() => void rasc.salvarRascunho()} loading={rasc.salvando} disabled={!temConteudo}>
        Salvar rascunho
      </Button>
    </div>
  );
}
