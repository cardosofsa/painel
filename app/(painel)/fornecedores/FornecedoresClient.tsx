"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Truck } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { criarFornecedor, atualizarFornecedor, removerFornecedor, alternarStatusFornecedor, type FornecedorInput } from "./actions";
import { executar } from "@/lib/acao";

export interface Fornecedor extends FornecedorInput {
  id: string;
}

const FORM_VAZIO: FornecedorInput = {
  nome: "",
  cnpj: "",
  contato: "",
  telefone: "",
  cidade: "",
  prazo: "",
  status: "ativo",
};

export function FornecedoresClient({
  fornecedores,
  comprasNoTrimestre,
}: {
  fornecedores: Fornecedor[];
  comprasNoTrimestre: number;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<FornecedorInput>(FORM_VAZIO);

  const ativos = fornecedores.filter((f) => f.status === "ativo").length;

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    setForm({ nome: f.nome, cnpj: f.cnpj, contato: f.contato, telefone: f.telefone, cidade: f.cidade, prazo: f.prazo, status: f.status });
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    startTransition(async () => {
      try {
        if (editando) {
          await executar(atualizarFornecedor(editando.id, form));
          toast.success("Fornecedor atualizado");
        } else {
          await executar(criarFornecedor(form));
          toast.success("Fornecedor cadastrado");
        }
        setModalAberto(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar fornecedor");
      }
    });
  }

  async function remover(f: Fornecedor) {
    const ok = await confirm({
      title: "Remover fornecedor?",
      message: `"${f.nome}" será removido definitivamente. Essa ação não pode ser desfeita.`,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await executar(removerFornecedor(f.id));
        toast("Fornecedor removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover fornecedor");
      }
    });
  }

  function alternarStatus(f: Fornecedor) {
    startTransition(async () => {
      try {
        await executar(alternarStatusFornecedor(f.id, f.status));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar status");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Fornecedores"
        actions={<Button variant="primary" onClick={abrirNovo}>+ Cadastrar Fornecedor</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <Card>
          <CardEyebrow>Fornecedores Cadastrados</CardEyebrow>
          <HeroMetric value={String(fornecedores.length)} caption={`${ativos} ativos`} />
        </Card>
        <Card>
          <CardEyebrow>Compras no Trimestre</CardEyebrow>
          <HeroMetric value={formatBRL(comprasNoTrimestre)} accent />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {fornecedores.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum fornecedor cadastrado" description="Cadastre seu primeiro fornecedor para começar." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Razão Social</Th>
                <Th>Contato</Th>
                <Th>Cidade / UF</Th>
                <Th>Prazo</Th>
                <Th>Status</Th>
                <Th align="right">Ações</Th>
              </tr>
            </Thead>
            <tbody>
              {fornecedores.map((f) => (
                <Tr key={f.id}>
                  <Td>
                    <div className={f.status === "inativo" ? "line-through text-text-tertiary" : "text-text-primary"}>
                      {f.nome}
                    </div>
                    <div className="text-xs text-text-tertiary font-mono">{f.cnpj}</div>
                  </Td>
                  <Td>
                    <div>{f.contato}</div>
                    <div className="text-xs text-text-tertiary font-mono">{f.telefone}</div>
                  </Td>
                  <Td>{f.cidade}</Td>
                  <Td>{f.prazo}</Td>
                  <Td>
                    <StatusChip
                      label={f.status === "ativo" ? "Ativo" : "Inativo"}
                      tone={f.status === "ativo" ? "positive" : "neutral"}
                    />
                  </Td>
                  <Td align="right">
                    <RowMenu
                      actions={[
                        { label: "Editar", onClick: () => abrirEdicao(f) },
                        { label: f.status === "ativo" ? "Desativar" : "Ativar", onClick: () => alternarStatus(f) },
                        { label: "Remover", onClick: () => remover(f), destructive: true },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editando ? "Editar Fornecedor" : "Cadastrar Fornecedor"}
      >
        <FormField label="Razão Social">
          <input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </FormField>
        <FormField label="CNPJ">
          <input className={inputClass} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
        </FormField>
        <FormField label="Contato">
          <input className={inputClass} value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
        </FormField>
        <FormField label="Telefone">
          <input className={inputClass} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        </FormField>
        <FormField label="Cidade / UF">
          <input className={inputClass} value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
        </FormField>
        <FormField label="Condição de Prazo">
          <input className={inputClass} value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
        </FormField>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={() => setModalAberto(false)}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
            Salvar
          </Button>
        </div>
      </Modal>
      {ConfirmDialog}
    </>
  );
}
