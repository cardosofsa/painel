"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/ui/Button";
import { copiarImagem, copiarTexto } from "@/lib/copiar";

/** Tempo que o ✓ fica no lugar do ícone de copiar. */
const MS_FEEDBACK = 1800;

function useFeedback() {
  const [feito, setFeito] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  function acender() {
    setFeito(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeito(false), MS_FEEDBACK);
  }
  return { feito, acender };
}

/**
 * Botãozinho de copiar para ficar ao lado de um texto gerado. Troca o ícone por ✓ por um
 * instante e avisa leitor de tela. Desabilitado quando não há o que copiar.
 *
 * `rotulo` entra no nome acessível ("Copiar título"), então dois botões na mesma tela não
 * soam iguais para quem usa leitor de tela.
 */
export function BotaoCopiar({ texto, rotulo, compacto = false, className = "" }: { texto: string; rotulo: string; compacto?: boolean; className?: string }) {
  const { feito, acender } = useFeedback();

  async function copiar() {
    if (await copiarTexto(texto)) acender();
    else toast.error("Não consegui copiar. Selecione o texto e copie com Ctrl+C.");
  }

  return (
    <>
      <IconButton
        type="button"
        aria-label={`Copiar ${rotulo}`}
        title={feito ? "Copiado!" : `Copiar ${rotulo}`}
        onClick={copiar}
        disabled={!texto}
        className={`${compacto ? "!h-6 !w-6 max-sm:!h-8 max-sm:!w-8" : ""} ${className}`}
      >
        {feito ? <Check size={compacto ? 13 : 15} className="text-positive" aria-hidden /> : <Copy size={compacto ? 13 : 15} aria-hidden />}
      </IconButton>
      <span className="sr-only" role="status" aria-live="polite">
        {feito ? `${rotulo} copiado` : ""}
      </span>
    </>
  );
}

/**
 * Copiar e baixar uma imagem (a capa pronta). Copiar a imagem depende do navegador: quando não
 * deixa, o botão avisa e o "Baixar" resolve. `url` pode ser de um blob ou do Storage.
 */
export function AcoesImagem({ url, nomeArquivo, rotulo }: { url: string; nomeArquivo: string; rotulo: string }) {
  const { feito, acender } = useFeedback();

  async function copiar() {
    try {
      const blob = await (await fetch(url)).blob();
      if (await copiarImagem(blob)) acender();
      else toast.error("Este navegador não deixa copiar imagem. Use o botão de baixar.");
    } catch {
      toast.error("Não consegui abrir a imagem para copiar. Use o botão de baixar.");
    }
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <IconButton type="button" aria-label={`Copiar ${rotulo}`} title={feito ? "Copiada!" : `Copiar ${rotulo}`} onClick={copiar}>
        {feito ? <Check size={15} className="text-positive" aria-hidden /> : <Copy size={15} aria-hidden />}
      </IconButton>
      <a
        href={url}
        download={nomeArquivo}
        aria-label={`Baixar ${rotulo}`}
        title={`Baixar ${rotulo}`}
        className="inline-flex h-8 w-8 max-sm:h-9 max-sm:w-9 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors duration-[--duracao-rapida] hover:bg-surface-2 hover:text-text-primary"
      >
        <Download size={15} aria-hidden />
      </a>
      <span className="sr-only" role="status" aria-live="polite">
        {feito ? `${rotulo} copiada` : ""}
      </span>
    </span>
  );
}
