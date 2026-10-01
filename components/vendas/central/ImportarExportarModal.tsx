"use client";
import type { ReactNode } from "react";

import { Download, FileUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Ponto único de "Importar/Exportar" em Vendas: escolhe o que fazer e abre o modal certo
 * (importar a planilha da Shopee, ou exportar a lista com os filtros atuais).
 */
export function ImportarExportarModal({ onClose, onImportarShopee, onExportar, podeImportar }: { onClose: () => void; onImportarShopee: () => void; onExportar: () => void; podeImportar: boolean }) {
  return (
    <Modal open onClose={onClose} title="Importar / Exportar" width="max-w-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Opcao
          icone={<FileUp size={20} />}
          titulo="Importar pedidos da Shopee"
          texto={podeImportar ? "Planilha exportada da Central do Vendedor (.xlsx). Reimportar atualiza sem duplicar." : "Precisa da migração 0046 aplicada."}
          desabilitado={!podeImportar}
          onClick={() => {
            onClose();
            onImportarShopee();
          }}
        />
        <Opcao
          icone={<Download size={20} />}
          titulo="Exportar pedidos"
          texto="A lista com os filtros e o período atuais, em planilha, PDF, imagem ou CSV."
          onClick={() => {
            onClose();
            onExportar();
          }}
        />
      </div>
    </Modal>
  );
}

function Opcao({ icone, titulo, texto, onClick, desabilitado = false }: { icone: ReactNode; titulo: string; texto: string; onClick: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={onClick}
      className="text-left rounded-lg border border-border p-4 hover:border-accent hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
    >
      <span className="text-accent">{icone}</span>
      <span className="block mt-2 text-sm font-medium text-text-primary">{titulo}</span>
      <span className="block mt-1 text-xs text-text-tertiary">{texto}</span>
    </button>
  );
}
