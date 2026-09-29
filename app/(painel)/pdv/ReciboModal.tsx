"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, ImageDown } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL, formatarDataIso, hojeIsoLocal } from "@/lib/format";
import { linkComprovanteWhatsapp, textoComprovante, type DadosComprovante } from "@/lib/comprovante";

export function ReciboModal({
  recibo,
  whatsappCliente,
  nomeNegocio,
  onClose,
  onNovaVenda,
}: {
  recibo: DadosComprovante | null;
  whatsappCliente: string | null;
  nomeNegocio: string | null;
  onClose: () => void;
  onNovaVenda: () => void;
}) {
  const [gerandoImagem, setGerandoImagem] = useState<"copiar" | "baixar" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gerandoImagem || !ref.current) return;
    const node = ref.current;
    const acao = gerandoImagem;
    (async () => {
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2 });
        const nomeArquivo = `comprovante-${recibo?.numero ?? "venda"}.png`;
        if (acao === "copiar") {
          try {
            const blob = await (await fetch(dataUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            toast.success("Imagem copiada — cole na conversa do WhatsApp");
          } catch {
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = nomeArquivo;
            a.click();
            toast.error("Não foi possível copiar — baixando a imagem em vez disso");
          }
        } else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = nomeArquivo;
          a.click();
          toast.success("Imagem baixada");
        }
      } catch {
        toast.error("Erro ao gerar imagem do comprovante");
      } finally {
        setGerandoImagem(null);
      }
    })();
  }, [gerandoImagem, recibo]);

  async function copiar() {
    if (!recibo) return;
    try {
      await navigator.clipboard.writeText(textoComprovante(recibo));
      toast.success("Comprovante copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Modal open={!!recibo} onClose={onClose} title={recibo ? `Venda ${recibo.numero} registrada` : ""} width="max-w-sm">
      {recibo && (
        <div>
          <div className="text-center mb-4">
            <div className="font-mono text-3xl font-semibold text-positive">{formatBRL(recibo.total)}</div>
            {recibo.clienteNome && <div className="text-sm text-text-secondary mt-1">{recibo.clienteNome}</div>}
          </div>

          <div className="divide-y divide-border border-y border-border mb-4">
            {recibo.itens.map((item, i) => (
              <div key={i} className="py-2 flex justify-between gap-3 text-sm">
                <span className="text-text-secondary">
                  {item.quantidade}× {item.nome}
                </span>
                <span className="font-mono text-text-primary shrink-0">{formatBRL(item.preco_unitario * item.quantidade)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mb-3">
            <a
              href={linkComprovanteWhatsapp(recibo, whatsappCliente)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="primary" className="w-full">
                <MessageCircle size={16} />
                {whatsappCliente ? "Enviar comprovante ao cliente" : "Enviar comprovante por WhatsApp"}
              </Button>
            </a>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={copiar}>
                <Copy size={14} />
                Copiar texto
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setGerandoImagem("copiar")}
                loading={gerandoImagem === "copiar"}
                disabled={gerandoImagem !== null}
              >
                <ImageDown size={14} />
                Copiar imagem
              </Button>
            </div>
          </div>

          <Button variant="secondary" className="w-full" onClick={onNovaVenda}>
            Nova venda
          </Button>
        </div>
      )}

      {/* Card oculto capturado como PNG — mesmo padrão de `resultado-compartilhado.tsx` e
          `ResumoFiadoImagem.tsx` (html-to-image, sem dependência nova). */}
      <div style={{ position: "fixed", left: -9999, top: 0, width: 360, pointerEvents: "none" }} aria-hidden>
        <div ref={ref}>
          {recibo && (
            <div style={{ background: "#ffffff", padding: 24, fontFamily: "system-ui, sans-serif", color: "#111827", border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{nomeNegocio ?? "Comprovante"}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>
                Venda {recibo.numero} · {formatarDataIso(hojeIsoLocal())}
              </div>
              {recibo.clienteNome && <div style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>Cliente: {recibo.clienteNome}</div>}

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                {recibo.itens.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, color: "#374151" }}>
                    <span>
                      {item.quantidade}× {item.nome}
                    </span>
                    <span>{formatBRL(item.preco_unitario * item.quantidade)}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                  <span>Subtotal</span>
                  <span>{formatBRL(recibo.subtotal)}</span>
                </div>
                {recibo.desconto > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Desconto</span>
                    <span>-{formatBRL(recibo.desconto)}</span>
                  </div>
                )}
                {recibo.valorEntrega > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Entrega</span>
                    <span>{formatBRL(recibo.valorEntrega)}</span>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  fontSize: 15,
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: 8,
                  marginTop: 4,
                  color: "#16a34a",
                }}
              >
                <span>Total</span>
                <span>{formatBRL(recibo.total)}</span>
              </div>

              {recibo.formaPagamento && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 10 }}>Pagamento: {recibo.formaPagamento}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
