"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Copy, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { textoResumoSemana, type ResumoSemana } from "@/lib/vixe/insights";

/**
 * Resumo da semana (onda C): os 7 últimos dias contra os 7 anteriores, os campeões, o que está
 * parado e o caixa da semana que vem, num texto para mandar para si mesmo no WhatsApp.
 */
export function CartaoResumoSemana({ resumo, loja, whatsapp }: { resumo: ResumoSemana; loja: string; whatsapp: string | null }) {
  const [aberto, setAberto] = useState(false);
  const texto = textoResumoSemana(resumo, loja, formatBRL);
  const digitos = whatsapp?.replace(/\D/g, "") ?? "";
  const link = `https://wa.me/${digitos ? (digitos.startsWith("55") ? digitos : `55${digitos}`) : ""}?text=${encodeURIComponent(texto)}`;
  const a = resumo.semana.atual;
  const v = resumo.semana.variacao.faturamento;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado");
    } catch {
      toast.error("Seu navegador bloqueou a cópia.");
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-1.5">
            <CalendarCheck size={16} className="text-accent" aria-hidden /> Resumo da semana
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {a.vendas} {a.vendas === 1 ? "venda" : "vendas"} · {formatBRL(a.faturamento)} · lucro {formatBRL(a.lucro)}
            {v !== null && (
              <span className={v >= 0 ? "text-positive" : "text-negative"}>
                {" "}
                ({v >= 0 ? "+" : ""}
                {Math.round(v * 100)}% vs semana passada)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAberto((x) => !x)}>
            {aberto ? "Esconder texto" : "Ver texto"}
          </Button>
          <Button size="sm" variant="secondary" onClick={copiar}>
            <Copy size={14} /> Copiar
          </Button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex">
            <Button size="sm" variant="primary">
              <MessageCircle size={14} /> {digitos ? "Mandar para mim" : "Abrir no WhatsApp"}
            </Button>
          </a>
        </div>
      </div>
      {aberto && <pre className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm text-text-primary font-sans">{texto}</pre>}
    </Card>
  );
}
