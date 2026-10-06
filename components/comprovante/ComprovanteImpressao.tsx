"use client";

import Link from "next/link";
import { ArrowLeft, ImageDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ComprovanteVenda } from "@/components/comprovante/ComprovanteVenda";
import { useComprovanteImagem } from "@/components/comprovante/useComprovanteImagem";
import type { DadosComprovante } from "@/lib/comprovante";
import { EstiloPapel, LARGURA_PAPEL, SeletorPapel, usePapel } from "@/components/comprovante/PapelImpressao";

/** Tela do comprovante: barra de ações (que não sai na impressão) e o documento centralizado. */
export function ComprovanteImpressao({ dados }: { dados: DadosComprovante }) {
  const { gerar, gerando, oculto } = useComprovanteImagem();
  const [papel, setPapel] = usePapel();

  return (
    <div>
      <EstiloPapel papel={papel} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5 print:hidden">
        <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={14} /> Vendas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorPapel papel={papel} onChange={setPapel} />
          <Button variant="secondary" onClick={() => gerar(dados)} loading={gerando}>
            <ImageDown size={14} />
            Ver imagem
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={14} />
            Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      <div className="flex justify-center print:block">
        <ComprovanteVenda dados={dados} largura={LARGURA_PAPEL[papel]} />
      </div>
      {oculto}
    </div>
  );
}
