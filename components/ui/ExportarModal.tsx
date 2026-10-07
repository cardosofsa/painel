"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, ImageIcon, FileDown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useCapturaImagem } from "@/components/ui/PreviaImagem";
import { matrizTexto, nomeArquivo, type TabelaExport } from "@/lib/exportar";
import { exportarTabela } from "@/lib/exportar-arquivos";

export type FormatoExport = "xlsx" | "pdf" | "imagem" | "csv";

export interface EscopoExport {
  id: string;
  rotulo: string;
  quantidade: number;
}

const FORMATOS: { id: FormatoExport; rotulo: string; ajuda: string; icone: typeof FileText }[] = [
  { id: "xlsx", rotulo: "Excel (.xlsx)", ajuda: "Planilha com números que somam", icone: FileSpreadsheet },
  { id: "pdf", rotulo: "PDF", ajuda: "Para imprimir ou arquivar", icone: FileText },
  { id: "imagem", rotulo: "Imagem", ajuda: "Copiar ou mandar no WhatsApp", icone: ImageIcon },
  { id: "csv", rotulo: "CSV", ajuda: "Para outros sistemas", icone: FileDown },
];

/** Linhas máximas na imagem: acima disso ela fica ilegível no celular. */
const MAX_LINHAS_IMAGEM = 40;

function TabelaImagem<L>({ tabela, empresa }: { tabela: TabelaExport<L>; empresa?: { nome: string | null; logoUrl?: string | null } | null }) {
  const m = matrizTexto({ ...tabela, linhas: tabela.linhas.slice(0, MAX_LINHAS_IMAGEM) });
  const resto = tabela.linhas.length - MAX_LINHAS_IMAGEM;
  const numerica = tabela.colunas.map((c) => !!c.tipo && c.tipo !== "texto" && c.tipo !== "data");
  const celula = { padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #eef0f2", whiteSpace: "nowrap" as const };
  return (
    <div style={{ background: "#fff", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111827", padding: 20, borderRadius: 14, border: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {empresa?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- captura por html-to-image
          <img src={empresa.logoUrl} alt="" crossOrigin="anonymous" style={{ width: 32, height: 32, objectFit: "contain" }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{tabela.titulo}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{[empresa?.nome, tabela.subtitulo, new Date().toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {m.cabecalho.map((h, i) => (
              <th key={i} style={{ ...celula, background: "#3b4d1f", color: "#fff", textAlign: numerica[i] ? "right" : "left", fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.linhas.map((l, r) => (
            <tr key={r} style={{ background: r % 2 ? "#f9fafb" : "#fff" }}>
              {l.map((v, i) => (
                <td key={i} style={{ ...celula, textAlign: numerica[i] ? "right" : "left" }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {m.total && (
            <tr style={{ background: "#f3f4f6", fontWeight: 700 }}>
              {m.total.map((v, i) => (
                <td key={i} style={{ ...celula, textAlign: numerica[i] ? "right" : "left" }}>
                  {v}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {resto > 0 && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>… e mais {resto} linhas. Use Excel ou PDF para a lista completa.</div>}
    </div>
  );
}

/**
 * Exportação padrão do sistema: escolhe O QUE (tudo, selecionados, filtrados) e COMO
 * (.xlsx, PDF, imagem, CSV). Quem chama só monta a tabela para o escopo escolhido.
 */
export function ExportarModal<L>({
  aberto,
  onClose,
  titulo,
  escopos,
  montar,
  empresa,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  /** Pelo menos um; os de quantidade 0 aparecem desabilitados. */
  escopos: EscopoExport[];
  /**
   * Monta a tabela do escopo. Pode ser assíncrono — lista paginada no servidor busca a
   * lista inteira só na hora de exportar. `null` = desistiu (o erro já foi mostrado).
   */
  montar: (escopo: string) => TabelaExport<L> | null | Promise<TabelaExport<L> | null>;
  empresa?: { nome: string | null; logoUrl?: string | null } | null;
}) {
  const [escopo, setEscopo] = useState(escopos.find((e) => e.quantidade > 0)?.id ?? escopos[0]?.id ?? "todos");
  const [formato, setFormato] = useState<FormatoExport>("xlsx");
  const [gerandoArquivo, setGerandoArquivo] = useState(false);
  // Durante a prévia da imagem este modal só se esconde: fechar de verdade (o pai remonta
  // pela `key`) levaria junto a imagem gerada.
  const [emPrevia, setEmPrevia] = useState(false);
  const { capturar, gerando, elementos } = useCapturaImagem();

  async function exportar() {
    setGerandoArquivo(true);
    let tabela: TabelaExport<L> | null;
    try {
      tabela = await montar(escopo);
    } catch (e) {
      console.error("[exportar] montar", e);
      toast.error("Não foi possível carregar a lista para exportar.");
      tabela = null;
    }
    setGerandoArquivo(false);
    if (!tabela) return;
    if (tabela.linhas.length === 0) {
      toast.error("Nada para exportar nesse escopo.");
      return;
    }
    if (formato === "imagem") {
      setEmPrevia(true);
      capturar(<TabelaImagem tabela={tabela} empresa={empresa} />, {
        nome: nomeArquivo(tabela.titulo, "png"),
        titulo: tabela.titulo,
        largura: Math.min(1100, 180 + tabela.colunas.length * 120),
        onFechar: () => {
          setEmPrevia(false);
          onClose();
        },
      });
      return;
    }
    setGerandoArquivo(true);
    try {
      await exportarTabela(tabela, formato, empresa);
      toast.success("Arquivo gerado");
      onClose();
    } catch (e) {
      console.error("[exportar]", e);
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setGerandoArquivo(false);
    }
  }

  return (
    <>
      <Modal open={aberto && !emPrevia} onClose={onClose} title={titulo} width="max-w-lg">
        {escopos.length > 1 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-text-secondary mb-1.5">O que exportar</div>
            <div className="flex flex-wrap gap-2">
              {escopos.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={e.quantidade === 0}
                  onClick={() => setEscopo(e.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 ${escopo === e.id ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
                >
                  {e.rotulo} <span className="tabular text-xs">({e.quantidade})</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="text-xs font-medium text-text-secondary mb-1.5">Formato</div>
        <div className="grid grid-cols-2 gap-2">
          {FORMATOS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormato(f.id)}
              className={`flex items-start gap-2.5 rounded-md border p-3 text-left ${formato === f.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
            >
              <f.icone size={18} className={formato === f.id ? "text-accent shrink-0 mt-0.5" : "text-text-tertiary shrink-0 mt-0.5"} />
              <span>
                <span className="block text-sm font-medium text-text-primary">{f.rotulo}</span>
                <span className="block text-xs text-text-tertiary">{f.ajuda}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" loading={gerandoArquivo || gerando} onClick={exportar}>
            Exportar
          </Button>
        </div>
      </Modal>
      {elementos}
    </>
  );
}
