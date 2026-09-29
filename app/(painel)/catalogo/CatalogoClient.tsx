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
import { executarComToast } from "@/lib/acao-cliente";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/Tabs";
import { PedidosVitrine, type PedidoVitrine } from "@/components/catalogo/PedidosVitrine";
import { AparenciaModal } from "@/components/catalogo/AparenciaModal";
import { PrecosCatalogoModal } from "@/components/catalogo/PrecosCatalogoModal";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "@/app/(painel)/pdv/tipos";

export interface Catalogo {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  tipo_preco: "varejo" | "atacado";
  criado_em: string;
}

const ABAS_CATALOGO = [
  { value: "catalogos", label: "Catálogos" },
  { value: "pedidos", label: "Pedidos" },
] as const satisfies readonly TabItem<"catalogos" | "pedidos">[];

export function CatalogoClient({
  catalogos,
  totalProdutosElegiveis,
  pedidos,
  clientes,
  contas,
  formasPagamento,
  iaDisponivel,
}: {
  catalogos: Catalogo[];
  totalProdutosElegiveis: number;
  pedidos: PedidoVitrine[];
  clientes: ClientePdv[];
  contas: ContaPdv[];
  formasPagamento: FormaPagamentoPdv[];
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalCatalogo, setModalCatalogo] = useState<Catalogo | "novo" | null>(null);
  const [precosCatalogo, setPrecosCatalogo] = useState<Catalogo | null>(null);
  const [aparenciaCatalogo, setAparenciaCatalogo] = useState<Catalogo | null>(null);
  // Abre direto nos pedidos quando há algo esperando: é o que o dono veio fazer.
  const [aba, setAba] = useState<"catalogos" | "pedidos">(
    pedidos.some((p) => p.status === "pendente") ? "pedidos" : "catalogos",
  );
  const pendentes = pedidos.filter((p) => p.status === "pendente").length;

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
      if (!modalCatalogo) return;
      const r =
        modalCatalogo === "novo"
          ? await executarComToast(criarCatalogo(dados), {
              sucesso: "Catálogo criado",
              erro: "Erro ao salvar catálogo",
            })
          : await executarComToast(atualizarCatalogo(modalCatalogo.id, dados), {
              sucesso: "Catálogo atualizado",
              erro: "Erro ao salvar catálogo",
            });
      if (r.ok) setModalCatalogo(null);
    });
  }

  function alternarAtivoHandler(c: Catalogo) {
    startTransition(async () => {
      await executarComToast(alternarAtivoCatalogo(c.id, c.ativo), { sucesso: c.ativo ? "Catálogo desativado" : "Catálogo ativado", erro: "Erro ao atualizar catálogo" });
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
      await executarComToast(regenerarLinkCatalogo(c.id), { sucesso: "Novo link gerado", erro: "Erro ao gerar novo link" });
    });
  }

  async function removerCatalogoHandler(c: Catalogo) {
    const ok = await confirm({ title: "Remover catálogo?", message: `"${c.nome}" e seu link serão removidos definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerCatalogo(c.id), { sucesso: "Catálogo removido", erro: "Erro ao remover catálogo" });
    });
  }

  return (
    <>
      <PageHeader
        title="Catálogo"
        actions={
          aba === "catalogos" ? (
            <Button variant="primary" onClick={() => setModalCatalogo("novo")}>
              + Novo Catálogo
            </Button>
          ) : undefined
        }
      />

      {/* Pedidos ficam AQUI dentro, não numa aba nova do sistema: uma aba nova em
          `lib/acesso.ts` vira um id que nenhuma conta existente tem em
          `perfis_acesso.abas`, e o recurso não apareceria para ninguém até o master
          liberar conta por conta. */}
      <Tabs
        tabs={[
          ABAS_CATALOGO[0],
          { ...ABAS_CATALOGO[1], label: pendentes > 0 ? `Pedidos (${pendentes})` : ABAS_CATALOGO[1].label },
        ]}
        value={aba}
        onChange={setAba}
        className="mb-5"
      />

      <TabPanel key={aba} tabValue={aba}>
      {aba === "pedidos" ? (
        <PedidosVitrine pedidos={pedidos} clientes={clientes} contas={contas} formasPagamento={formasPagamento} />
      ) : (
      <>
      <Card className="mb-5">
        <p className="text-sm text-text-secondary">
          Cada catálogo é uma vitrine pública com um link próprio, pronta pra enviar ao cliente. Os produtos entram
          automaticamente: hoje <strong className="text-text-primary">{totalProdutosElegiveis}</strong> produto(s) ativo(s) e
          com estoque aparecem nos catálogos. Cada catálogo é de <strong className="text-text-primary">varejo</strong> ou de{" "}
          <strong className="text-text-primary">atacado</strong> e usa o preço correspondente de cada produto; produto sem preço
          aparece como “Consultar”. Use &quot;Preços&quot; pra ajustar um valor só num catálogo específico.
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
                    <StatusChip label={c.tipo_preco === "atacado" ? "Atacado" : "Varejo"} tone="neutral" />
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
                    { label: "Personalizar Aparência", onClick: () => setAparenciaCatalogo(c) },
                    { label: "Preços", onClick: () => setPrecosCatalogo(c) },
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
      <AparenciaModal
        key={`aparencia-${aparenciaCatalogo?.id ?? "fechado"}`}
        catalogo={aparenciaCatalogo}
        iaDisponivel={iaDisponivel}
        onClose={() => setAparenciaCatalogo(null)}
      />
      {ConfirmDialog}
      </>
      )}
      </TabPanel>
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
  const base: CatalogoInput = catalogo && catalogo !== "novo" ? { nome: catalogo.nome, tipo_preco: catalogo.tipo_preco } : { nome: "", tipo_preco: "varejo" };
  const [nome, setNome] = useState(base.nome);
  const [tipoPreco, setTipoPreco] = useState<CatalogoInput["tipo_preco"]>(base.tipo_preco);
  const [inicial] = useState(base);
  const sujo = useFormularioSujo({ nome, tipo_preco: tipoPreco }, inicial);

  return (
    <Modal open={!!catalogo} onClose={onClose} title={catalogo === "novo" ? "Novo Catálogo" : "Editar Catálogo"} sujo={sujo}>
      <FormField label="Nome do Catálogo">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Catálogo Varejo" />
      </FormField>
      <FormField
        label="Tipo de preço"
        dica="Varejo usa o preço de venda de cada produto; atacado usa o preço de atacado (sem ele, o produto aparece como “Consultar”)."
      >
        <select className={inputClass} value={tipoPreco} onChange={(e) => setTipoPreco(e.target.value as CatalogoInput["tipo_preco"])}>
          <option value="varejo">Varejo</option>
          <option value="atacado">Atacado</option>
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
