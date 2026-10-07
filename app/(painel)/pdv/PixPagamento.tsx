"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { gerarPixCopiaECola } from "@/lib/pix";

export interface PixLoja {
  chave: string;
  nome: string;
  cidade: string;
}

/**
 * QR + copia-e-cola do Pix da loja com o valor desta venda (BR Code estático: o banco não
 * avisa o pagamento, quem confere é o caixa). Sem Pix configurado, aponta para Configurações.
 */
export function PixPagamento({ pix, valor, rotulo }: { pix: PixLoja | null; valor: number; rotulo?: string }) {
  const codigo = useMemo(() => {
    if (!pix || !(valor > 0)) return null;
    try {
      return gerarPixCopiaECola({ ...pix, valor, txid: "PDV" });
    } catch {
      return null;
    }
  }, [pix, valor]);
  const [qr, setQr] = useState<{ codigo: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // QR gerado no navegador (a lib só carrega quando há Pix). data: URL — a CSP libera img data:.
  useEffect(() => {
    if (!codigo) return;
    let ativo = true;
    import("qrcode")
      .then((m) => m.toDataURL(codigo, { width: 220, margin: 1, errorCorrectionLevel: "M" }))
      .then((url) => {
        if (ativo) setQr({ codigo, url });
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [codigo]);

  if (!pix) {
    return (
      <div className="rounded-md border border-border bg-surface-2 p-3 mb-4 text-sm text-text-secondary flex items-start gap-2">
        <Smartphone size={16} className="shrink-0 mt-0.5 text-text-tertiary" />
        <span>
          Mostre o QR do Pix aqui cadastrando a chave da loja em{" "}
          <Link href="/configuracoes?aba=conta" className="text-accent underline-offset-2 hover:underline">
            Configurações
          </Link>
          .
        </span>
      </div>
    );
  }
  if (!codigo) return null;

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      toast.success("Pix copia-e-cola copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const url = qr?.codigo === codigo ? qr.url : null;
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3 mb-4 flex flex-col sm:flex-row items-center gap-3">
      <div className="w-44 h-44 shrink-0 rounded-md bg-surface-1 border border-border flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada no navegador */}
        {url ? <img src={url} alt={`QR Code Pix de ${formatBRL(valor)}`} width={176} height={176} className="w-full h-full" /> : <span className="text-xs text-text-tertiary">Gerando QR…</span>}
      </div>
      <div className="min-w-0 flex-1 w-full">
        <div className="text-sm text-text-secondary">{rotulo ?? "Pix"}</div>
        <div className="font-mono text-xl font-semibold text-text-primary">{formatBRL(valor)}</div>
        <div className="text-xs text-text-tertiary mt-0.5 truncate">
          {pix.nome} · {pix.chave}
        </div>
        <p className="mt-2 font-mono text-[11px] leading-snug text-text-tertiary break-all line-clamp-2" title={codigo}>
          {codigo}
        </p>
        <Button variant="secondary" className="mt-2 w-full sm:w-auto" onClick={copiar}>
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          Copiar Pix copia-e-cola
        </Button>
        <p className="text-xs text-text-tertiary mt-2">Confira o recebimento no app do banco antes de finalizar.</p>
      </div>
    </div>
  );
}
