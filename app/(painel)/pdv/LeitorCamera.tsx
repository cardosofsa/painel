"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/Modal";

/** O que usamos da API nativa (ainda fora do lib.dom do TypeScript). */
interface DetectorDeCodigo {
  detect(fonte: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type ConstrutorDetector = new (opcoes?: { formats?: string[] }) => DetectorDeCodigo;

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function construtorDetector(): ConstrutorDetector | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { BarcodeDetector?: ConstrutorDetector }).BarcodeDetector;
  return typeof c === "function" && !!navigator.mediaDevices?.getUserMedia ? c : null;
}

const semInscricao = () => () => undefined;

/**
 * O navegador lê código de barras pela câmera? (Chrome/Android sim; iOS/Safari e Firefox
 * não têm `BarcodeDetector`.) No servidor e na hidratação é `false`: o botão só aparece
 * depois, sem divergir do HTML do servidor.
 */
export function useLeitorCameraDisponivel(): boolean {
  return useSyncExternalStore(
    semInscricao,
    () => !!construtorDetector(),
    () => false,
  );
}

/**
 * Modal com a câmera traseira lendo EAN-13/EAN-8/UPC/Code128. Ao ler, chama `onLido` uma
 * vez e fecha. Monte só enquanto aberto (`{aberto && <LeitorCamera …/>}`): desmontar é o
 * que para a câmera.
 */
export function LeitorCamera({ onLido, onFechar }: { onLido: (codigo: string) => void; onFechar: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const onLidoRef = useRef(onLido);
  useEffect(() => {
    onLidoRef.current = onLido;
  }, [onLido]);

  useEffect(() => {
    const Detector = construtorDetector();
    if (!Detector) return;
    let ativo = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function iniciar() {
      let detector: DetectorDeCodigo;
      try {
        detector = new Detector!({ formats: FORMATOS });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        if (ativo) {
          const negado = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
          setErro(negado ? "Sem permissão para usar a câmera. Libere nas configurações do navegador." : "Não foi possível abrir a câmera.");
        }
        return;
      }
      if (!ativo) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const ler = async () => {
        if (!ativo) return;
        try {
          if (video.readyState >= 2) {
            const achados = await detector.detect(video);
            const codigo = achados.find((a) => a.rawValue?.trim())?.rawValue.trim();
            if (codigo && ativo) {
              ativo = false;
              onLidoRef.current(codigo);
              return;
            }
          }
        } catch {
          // quadro ruim: tenta o próximo
        }
        timer = setTimeout(ler, 200);
      };
      void ler();
    }
    void iniciar();

    return () => {
      ativo = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal open onClose={onFechar} title="Ler código de barras" width="max-w-md">
      {erro ? (
        <p className="text-sm text-negative">{erro}</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg bg-surface-2 aspect-[4/3]">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-accent/80" />
          </div>
          <p className="text-xs text-text-tertiary mt-2">Aponte a câmera para o código de barras do produto.</p>
        </>
      )}
    </Modal>
  );
}
