"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpen, Copy, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import {
  criarCatalogo,
  atualizarCatalogo,
  alternarAtivoCatalogo,
  regenerarLinkCatalogo,
  removerCatalogo,
  type CatalogoInput,
} from "./actions";

export interface Catalogo {
  id: string;
  nome: string;
  slug: string;
  tipo_preco: "venda" | "atacado";
  ativo: boolean;
  criado_em: string;
}

const TIPO_PRECO_LABEL: Record<Catalogo["tipo_preco"], string> = {
  venda: "Preço de venda",
  atacado: "Preço de atacado",
};

export function CatalogoClient({
  catalogos,
  totalProdutosElegiveis,
}: {
  catalogos: Catalogo[];
  totalProdutosElegiveis: number;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalCatalogo, setModalCatalogo] = useState<Catalogo | "novo" | null>(null);

  function linkPublico(slug: string) {
    return `${window.location.origin}/vitrine/${slug}`;
  }

  async function copiarLink(slug: string) {
    try {
      await navigator.clipboard.writeText(linkPublico(slug));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  }

  function salvarCatalogoHandler(dados: CatalogoInput) {
    startTransition(async () => {
      try {
        if (modalCatalogo === "novo") {
          await criarCatalogo(dados);
          toast.success("Catálogo criado");
        } else if (modalCatalogo) {
          await atualizarCatalogo(modalCatalogo.id, dados);
          toast.success("Catálogo atualizado");
        }
        setModalCatalogo(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar catálogo");
      }
    });
  }

  function alternarAtivoHandler(c: Catalogo) {
    startTransition(async () => {
      try {
        await alternarAtivoCatalogo(c.id, c.ativo);
        toast.success(c.ativo ? "Catálogo desativado" : "Catálogo ativado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar catálogo");
      }
    });
  }

  async function regenerarLinkHandler(c: Catalogo) {
    const ok = await confirm({
      title: "Gerar novo link?",
      message: `O link atual de "${c.nome}" para de funcionar imediatamente. Use isso se o link antigo vazou ou não deve mais circular.`,
      confirmLabel: "Gerar novo link",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await regenerarLinkCatalogo(c.id);
        toast.success("Novo link gerado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao gerar novo link");
      }
    });
  }

  async function removerCatalogoHandler(c: Catalogo) {
    const ok = await confirm({ title: "Remover catálogo?", message: `"${c.nome}" e seu link serão removidos definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerCatalogo(c.id);
        toast("Catálogo removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover catálogo");
      }
    });
  }

  return (
    <>
      <PageHeader title="Catálogo" actions={<Button variant="primary" onClick={() => setModalCatalogo("novo")}>+ Novo Catálogo</Button>} />

      <Card className="mb-5">
        <p className="text-sm text-text-secondary">
          Cada catálogo é uma vitrine pública com um link próprio, pronta pra enviar ao cliente. Os produtos entram
          automaticamente: hoje <strong className="text-text-primary">{totalProdutosElegiveis}</strong> produto(s) ativo(s) e
          com estoque aparecem nos catálogos.
        </p>
      </Card>

      {catalogos.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Nenhum catálogo criado ainda"
            description="Crie um catálogo de venda pro cliente final, ou um de atacado pra revendedor — cada um com seu próprio link."
            action={
              <Button variant="primary" onClick={() => setModalCatalogo("novo")}>
                + Novo Catálogo
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {catalogos.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-text-primary">{c.nome}</span>
                    <StatusChip label={c.ativo ? "Ativo" : "Inativo"} tone={c.ativo ? "positive" : "neutral"} />
                  </div>
                  <div className="text-xs text-text-tertiary mb-2">{TIPO_PRECO_LABEL[c.tipo_preco]}</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-surface-2 text-text-secondary rounded px-2 py-1 truncate max-w-xs">
                      /vitrine/{c.slug}
                    </code>
                    <button onClick={() => copiarLink(c.slug)} className="text-text-tertiary hover:text-accent shrink-0" title="Copiar link">
                      <Copy size={14} />
                    </button>
                    <a
                      href={`/vitrine/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-accent shrink-0"
                      title="Ver como cliente"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <RowMenu
                  actions={[
                    { label: "Editar", onClick: () => setModalCatalogo(c) },
                    { label: c.ativo ? "Desativar" : "Ativar", onClick: () => alternarAtivoHandler(c) },
                    { label: "Gerar novo link", onClick: () => regenerarLinkHandler(c) },
                    { label: "Remover", onClick: () => removerCatalogoHandler(c), destructive: true },
                  ]}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <CatalogoModal
        key={`catalogo-${modalCatalogo === "novo" ? "novo" : (modalCatalogo?.id ?? "fechado")}`}
        catalogo={modalCatalogo}
        onClose={() => setModalCatalogo(null)}
        onSave={salvarCatalogoHandler}
        salvando={pending}
      />
      {ConfirmDialog}
    </>
  );
}

function CatalogoModal({
  catalogo,
  onClose,
  onSave,
  salvando,
}: {
  catalogo: Catalogo | "novo" | null;
  onClose: () => void;
  onSave: (dados: CatalogoInput) => void;
  salvando: boolean;
}) {
  const base = catalogo && catalogo !== "novo" ? catalogo : { nome: "", tipo_preco: "venda" as const };
  const [nome, setNome] = useState(base.nome);
  const [tipoPreco, setTipoPreco] = useState<Catalogo["tipo_preco"]>(base.tipo_preco);

  return (
    <Modal open={!!catalogo} onClose={onClose} title={catalogo === "novo" ? "Novo Catálogo" : "Editar Catálogo"}>
      <FormField label="Nome do Catálogo">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Catálogo Varejo" />
      </FormField>
      <FormField label="Preço exibido">
        <select className={inputClass} value={tipoPreco} onChange={(e) => setTipoPreco(e.target.value as Catalogo["tipo_preco"])}>
          <option value="venda">Preço de venda (cliente final)</option>
          <option value="atacado">Preço de atacado (revendedor)</option>
        </select>
      </FormField>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, tipo_preco: tipoPreco })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
