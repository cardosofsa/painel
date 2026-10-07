"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, Download, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface Previa {
  blob: Blob;
  url: string;
  nome: string;
  titulo: string;
  /** Texto que acompanha no WhatsApp/compartilhar (opcional). */
  texto?: string;
  /** Chamado quando a prévia fecha (ex.: fechar o modal que pediu a imagem). */
  onFechar?: () => void;
}

/**
 * Captura um cartão como PNG e abre a PRÉVIA, com Copiar, Baixar e Compartilhar.
 *
 * Por que prévia e não "copiar direto": o navegador só deixa escrever no clipboard dentro
 * de um clique, e a captura leva tempo. Antes, `clipboard.write` rodava depois do
 * `toPng` + `fetch(dataUrl)` — o `fetch` de `data:` é barrado pela CSP (`connect-src`) e
 * tudo caía no "baixando em vez disso". Agora a imagem já existe (como Blob, via
 * `toBlob`, sem `fetch`) quando a pessoa clica em Copiar, e o clique é o gesto.
 */
export function useCapturaImagem() {
  const [pendente, setPendente] = useState<{ conteudo: ReactNode; nome: string; titulo: string; texto?: string; largura?: number; onFechar?: () => void } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendente || !ref.current) return;
    const node = ref.current;
    const { nome, titulo, texto, onFechar } = pendente;
    // `html-to-image` só desce quando alguém pede a imagem: estático, ele ia no
    // JavaScript de toda tela que tem o botão (comprovante, precificação, fiado, exportar).
    import("html-to-image")
      .then(({ toBlob }) => toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true }))
      .then((blob) => {
        if (!blob) throw new Error("vazio");
        setPrevia({ blob, url: URL.createObjectURL(blob), nome, titulo, texto, onFechar });
      })
      .catch(() => {
        toast.error("Não foi possível gerar a imagem");
        onFechar?.();
      })
      .finally(() => setPendente(null));
  }, [pendente]);

  function capturar(conteudo: ReactNode, opcoes: { nome: string; titulo: string; texto?: string; largura?: number; onFechar?: () => void }) {
    setPendente({ conteudo, ...opcoes });
  }

  function fechar() {
    if (previa) URL.revokeObjectURL(previa.url);
    previa?.onFechar?.();
    setPrevia(null);
  }

  const elementos = (
    <>
      <div style={{ position: "fixed", left: -10000, top: 0, width: pendente?.largura ?? 380, pointerEvents: "none" }} aria-hidden>
        <div ref={ref}>{pendente?.conteudo}</div>
      </div>
      <PreviaImagemModal previa={previa} onClose={fechar} />
    </>
  );

  return { capturar, gerando: pendente !== null, elementos };
}

function PreviaImagemModal({ previa, onClose }: { previa: Previa | null; onClose: () => void }) {
  const arquivo = previa ? new File([previa.blob], previa.nome, { type: "image/png" }) : null;
  const podeCompartilhar =
    !!arquivo && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] });

  async function copiar() {
    if (!previa) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": previa.blob })]);
      toast.success("Imagem copiada. Cole na conversa do WhatsApp.");
    } catch {
      toast.error("Este navegador não deixa copiar imagem. Use Baixar ou Compartilhar.");
    }
  }

  function baixar() {
    if (!previa) return;
    const a = document.createElement("a");
    a.href = previa.url;
    a.download = previa.nome;
    a.click();
    toast.success("Imagem baixada");
  }

  async function compartilhar() {
    if (!arquivo) return;
    try {
      await navigator.share({ files: [arquivo], text: previa?.texto });
    } catch {
      // Cancelar o compartilhamento também cai aqui: não é erro para mostrar.
    }
  }

  return (
    <Modal open={!!previa} onClose={onClose} title={previa?.titulo ?? ""} width="max-w-2xl">
      {previa && (
        <>
          <div className="rounded-md border border-border bg-surface-2 p-2 max-h-[60vh] overflow-y-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob local, não passa pelo otimizador */}
            <img src={previa.url} alt={previa.titulo} className="w-full h-auto rounded" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Button variant="secondary" onClick={copiar}>
              <Copy size={14} /> Copiar
            </Button>
            <Button variant="secondary" onClick={baixar}>
              <Download size={14} /> Baixar
            </Button>
            {podeCompartilhar ? (
              <Button variant="primary" onClick={compartilhar}>
                <Share2 size={14} /> Enviar
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => window.open(`https://wa.me/${previa.texto ? `?text=${encodeURIComponent(previa.texto)}` : ""}`, "_blank", "noopener,noreferrer")}
                title="Copie a imagem e cole na conversa"
              >
                <Share2 size={14} /> WhatsApp
              </Button>
            )}
          </div>
          {!podeCompartilhar && <p className="text-xs text-text-tertiary mt-2">No computador: clique em Copiar e cole (Ctrl+V) na conversa do WhatsApp.</p>}
        </>
      )}
    </Modal>
  );
}
