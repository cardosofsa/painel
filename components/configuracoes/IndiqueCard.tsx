"use client";

import { toast } from "sonner";
import { Copy, Gift, MessageCircle } from "lucide-react";
import { Button, classesBotao } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { linkIndicacao, linkWhatsApp, type ResumoIndicacoes } from "@/lib/indicacao";

/** Estado da indicação para a tela: dados, migração 0078 ausente, ou nada a mostrar. */
export type EstadoIndicacoes = ResumoIndicacoes | "sem-migracao" | null;

/** Configurações → Plano: "Indique e ganhe 1 mês" (0078). */
export function IndiqueCard({ estado, siteUrl }: { estado: EstadoIndicacoes; siteUrl: string }) {
  if (!estado) return null;
  if (estado === "sem-migracao") {
    return (
      <Card className="text-sm text-text-secondary">
        O programa de indicação precisa da migração <span className="font-mono">0078_indicacoes.sql</span>. Aplique no Supabase e recarregue a página.
      </Card>
    );
  }

  const link = linkIndicacao(siteUrl, estado.codigo);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o link e copie à mão.");
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <Gift size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Indique e ganhe 1 mês</h3>
          <p className="text-sm text-text-secondary">
            Quem criar a conta pelo seu link e assinar um plano pago ganha {estado.dias_bonus} dias a mais — e você também.
          </p>
        </div>
      </div>

      <label htmlFor="link-indicacao" className="block text-xs text-text-tertiary mb-1">
        Seu link (código <span className="font-mono">{estado.codigo}</span>)
      </label>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input id="link-indicacao" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-xs flex-1 min-w-0`} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copiar}>
            <Copy size={14} aria-hidden="true" /> Copiar
          </Button>
          <a href={linkWhatsApp(link)} target="_blank" rel="noopener noreferrer" className={classesBotao({ variant: "secondary" })}>
            <MessageCircle size={14} aria-hidden="true" /> WhatsApp
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-surface-2 p-3">
          <div className="text-xs text-text-tertiary">Cadastros pelo link</div>
          <div className="text-lg font-mono font-semibold text-text-primary">{estado.cadastros.toLocaleString("pt-BR")}</div>
        </div>
        <div className="rounded-md bg-surface-2 p-3">
          <div className="text-xs text-text-tertiary">Viraram assinatura (você ganhou)</div>
          <div className="text-lg font-mono font-semibold text-text-primary">{estado.recompensadas.toLocaleString("pt-BR")}</div>
        </div>
      </div>
    </Card>
  );
}
