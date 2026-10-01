"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * QR code do link do catálogo, para imprimir no balcão, na embalagem ou no cartão de visita.
 * Gerado no navegador (`qrcode`, carregado só aqui): o link não passa por serviço externo.
 */
export function QrCatalogoModal({ catalogo, onClose }: { catalogo: { nome: string; slug: string }; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const link = `${window.location.origin}/vitrine/${catalogo.slug}`;
    let vivo = true;
    import("qrcode")
      .then((m) => m.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: "M" }))
      .then((d) => {
        if (vivo) {
          setUrl(link);
          setDataUrl(d);
        }
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [catalogo.slug]);

  function baixar() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${catalogo.slug}.png`;
    a.click();
  }

  function imprimir() {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=640");
    if (!w) return;
    // Página mínima só com o QR, o nome e o link: o navegador abre a impressão em seguida.
    w.document.title = `QR — ${catalogo.nome}`;
    const corpo = w.document.body;
    corpo.style.cssText = "font-family:system-ui,sans-serif;text-align:center;padding:32px";
    const h = w.document.createElement("h2");
    h.textContent = catalogo.nome;
    const img = w.document.createElement("img");
    img.src = dataUrl;
    img.style.cssText = "width:320px;height:320px";
    const p = w.document.createElement("p");
    p.textContent = "Aponte a câmera para ver o catálogo";
    p.style.cssText = "color:#555";
    const l = w.document.createElement("p");
    l.textContent = url;
    l.style.cssText = "font-size:12px;color:#888";
    corpo.append(h, img, p, l);
    img.onload = () => w.print();
  }

  return (
    <Modal open onClose={onClose} title={`QR code · ${catalogo.nome}`} width="max-w-sm">
      <div className="flex flex-col items-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL gerada aqui
          <img src={dataUrl} alt={`QR code do catálogo ${catalogo.nome}`} className="w-64 h-64 rounded-md border border-border bg-white" />
        ) : (
          <div className="w-64 h-64 rounded-md border border-border bg-surface-2 animate-pulse" />
        )}
        <p className="text-xs text-text-tertiary mt-2 break-all text-center">{url}</p>
        <div className="grid grid-cols-2 gap-2 w-full mt-4">
          <Button variant="secondary" onClick={baixar} disabled={!dataUrl}>
            <Download size={14} /> Baixar
          </Button>
          <Button variant="primary" onClick={imprimir} disabled={!dataUrl}>
            <Printer size={14} /> Imprimir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
