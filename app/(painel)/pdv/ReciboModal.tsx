"use client";

import { useEffect, useState } from "react";
import { Copy, FileText, ImageDown, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { linkComprovanteWhatsapp, textoComprovante, type DadosComprovante } from "@/lib/comprovante";
import { obterComprovante } from "@/app/(painel)/vendas/comprovante-actions";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";

export function ReciboModal({
  recibo,
  vendaId,
  whatsappCliente,
  onClose,
  onNovaVenda,
}: {
  recibo: DadosComprovante | null;
  vendaId: string | null;
  whatsappCliente: string | null;
  onClose: () => void;
  onNovaVenda: () => void;
}) {
  // O `recibo` local é o que o caixa tinha na tela; os dados completos (empresa, endereço do
  // cliente, garantia gravada, taxa, parcelas) vêm do banco logo depois do modal abrir.
  const [completo, setCompleto] = useState<DadosComprovante | null>(null);
  const [falhou, setFalhou] = useState(false);
  const { gerar, gerando, oculto } = useComprovanteImagem();

  useEffect(() => {
    if (!vendaId) return;
    let vivo = true;
    obterComprovante(vendaId)
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setCompleto(r.dado);
        else setFalhou(true);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
    };
  }, [vendaId]);

  const dados = completo && recibo && completo.numero === recibo.numero ? completo : recibo;
  const pronto = dados === completo || falhou;

  async function copiarTexto() {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(textoComprovante(dados));
      toast.success("Comprovante copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Modal open={!!recibo} onClose={onClose} title={recibo ? `Venda ${recibo.numero} registrada` : ""} width="max-w-sm">
      {recibo && dados && (
        <div>
          <div className="text-center mb-4">
            <div className="font-mono text-3xl font-semibold text-positive">{formatBRL(dados.total)}</div>
            {dados.clienteNome && <div className="text-sm text-text-secondary mt-1">{dados.clienteNome}</div>}
          </div>

          <div className="divide-y divide-border border-y border-border mb-4">
            {dados.itens.map((item, i) => (
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
              href={linkComprovanteWhatsapp(dados, whatsappCliente)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="primary" className="w-full">
                <MessageCircle size={16} />
                {whatsappCliente ? "Enviar comprovante ao cliente" : "Enviar comprovante por WhatsApp"}
              </Button>
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={copiarTexto}>
                <Copy size={14} />
                Copiar texto
              </Button>
              <Button
                variant="secondary"
                onClick={() => gerar(dados, "copiar")}
                disabled={!pronto || gerando}
                loading={gerando}
              >
                <ImageDown size={14} />
                Copiar imagem
              </Button>
              <Button variant="secondary" onClick={() => gerar(dados, "baixar")} disabled={!pronto || gerando}>
                <ImageDown size={14} />
                Baixar imagem
              </Button>
              {vendaId ? (
                <a href={`/vendas/${vendaId}/comprovante`} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="secondary" className="w-full">
                    <FileText size={14} />
                    PDF / Imprimir
                  </Button>
                </a>
              ) : null}
            </div>
          </div>

          <Button variant="secondary" className="w-full" onClick={onNovaVenda}>
            Nova venda
          </Button>
        </div>
      )}
      {oculto}
    </Modal>
  );
}
