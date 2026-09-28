"use client";

import { useEffect, useState, useTransition } from "react";
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
import { formatBRL } from "@/lib/format";
import {
  criarCatalogo,
  atualizarCatalogo,
  alternarAtivoCatalogo,
  regenerarLinkCatalogo,
  removerCatalogo,
  listarPrecosCatalogo,
  salvarPrecosCatalogo,
  type CatalogoInput,
  type ProdutoPrecoCatalogo,
} from "./actions";
import { executar } from "@/lib/acao";

export interface Catalogo {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  criado_em: string;
}

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
  const [precosCatalogo, setPrecosCatalogo] = useState<Catalogo | null>(null);

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
          await executar(criarCatalogo(dados));
          toast.success("Catálogo criado");
        } else if (modalCatalogo) {
          await executar(atualizarCatalogo(modalCatalogo.id, dados));
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
        await executar(alternarAtivoCatalogo(c.id, c.ativo));
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
        await executar(regenerarLinkCatalogo(c.id));
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
        await executar(removerCatalogo(c.id));
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
          com estoque aparecem nos catálogos. O preço padrão é o preço de venda — use &quot;Editar Preços&quot; pra ajustar um
          valor diferente só num catálogo específico.
        </p>
      </Card>

      {catalogos.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Nenhum catálogo criado ainda"
            description="Crie um catálogo pra compartilhar com o cliente final, ou outro com preços especiais pra revendedor — cada um com seu próprio link."
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
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-text-primary">{c.nome}</span>
                    <StatusChip label={c.ativo ? "Ativo" : "Inativo"} tone={c.ativo ? "positive" : "neutral"} />
                  </div>
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
                    { label: "Editar Preços", onClick: () => setPrecosCatalogo(c) },
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
      <PrecosCatalogoModal
        key={`precos-${precosCatalogo?.id ?? "fechado"}`}
        catalogo={precosCatalogo}
        onClose={() => setPrecosCatalogo(null)}
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
  const base = catalogo && catalogo !== "novo" ? catalogo : { nome: "" };
  const [nome, setNome] = useState(base.nome);

  return (
    <Modal open={!!catalogo} onClose={onClose} title={catalogo === "novo" ? "Novo Catálogo" : "Editar Catálogo"}>
      <FormField label="Nome do Catálogo">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Catálogo Varejo" />
      </FormField>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function PrecosCatalogoModal({ catalogo, onClose }: { catalogo: Catalogo | null; onClose: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<ProdutoPrecoCatalogo[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!catalogo) return;
    // `executar` desembrulha o `Resultado` da action e relança a mensagem traduzida,
    // que o `.catch` abaixo transforma em toast.
    executar(listarPrecosCatalogo(catalogo.id))
      .then((dados) => {
        setItens(dados);
        setOverrides(
          Object.fromEntries(dados.filter((d) => d.preco_override !== null).map((d) => [d.produto_id, String(d.preco_override)])),
        );
      })
      .catch(() => toast.error("Erro ao carregar produtos"))
      .finally(() => setCarregando(false));
  }, [catalogo]);

  async function salvar() {
    if (!catalogo) return;
    setSalvando(true);
    try {
      const payload = itens.map((item) => {
        const texto = overrides[item.produto_id]?.trim();
        const preco = texto ? Number(texto) : null;
        return { produto_id: item.produto_id, preco: preco !== null && !Number.isNaN(preco) ? preco : null };
      });
      await executar(salvarPrecosCatalogo(catalogo.id, payload));
      toast.success("Preços salvos");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar preços");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={!!catalogo} onClose={onClose} title={catalogo ? `Editar Preços — ${catalogo.nome}` : ""} width="max-w-xl">
      <p className="text-sm text-text-secondary mb-4">
        Deixe em branco pra usar o preço de venda normal. O valor aqui vale só pra este catálogo.
      </p>
      {carregando ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Nenhum produto ativo com estoque no momento.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
          {itens.map((item) => (
            <div key={item.produto_id} className="flex items-center justify-between gap-3 border border-border rounded-md p-2.5">
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">{item.produto_nome}</div>
                <div className="text-xs text-text-tertiary">Venda: {formatBRL(item.preco_venda)}</div>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder={item.preco_venda.toFixed(2)}
                className="w-28 h-9 px-2 bg-surface-1 border border-border rounded-md text-sm text-right outline-none focus:border-accent"
                value={overrides[item.produto_id] ?? ""}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [item.produto_id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={carregando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
