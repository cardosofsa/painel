"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { fornecedores as fornecedoresIniciais } from "@/lib/mock-data";

type Fornecedor = (typeof fornecedoresIniciais)[number];
type FornecedorForm = Omit<Fornecedor, "id">;

const FORM_VAZIO: FornecedorForm = {
  nome: "",
  cnpj: "",
  contato: "",
  telefone: "",
  cidade: "",
  prazo: "",
  status: "ativo",
};

let nextId = fornecedoresIniciais.length + 1;

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>(fornecedoresIniciais);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FornecedorForm>(FORM_VAZIO);

  const ativos = fornecedores.filter((f) => f.status === "ativo").length;

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditandoId(f.id);
    setForm({ ...f });
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    if (editandoId) {
      setFornecedores((prev) => prev.map((f) => (f.id === editandoId ? { ...f, ...form } : f)));
      toast.success("Fornecedor atualizado");
    } else {
      nextId += 1;
      setFornecedores((prev) => [...prev, { id: `f${nextId}`, ...form }]);
      toast.success("Fornecedor cadastrado");
    }
    setModalAberto(false);
  }

  function remover(id: string) {
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    toast("Fornecedor removido");
  }

  function alternarStatus(id: string) {
    setFornecedores((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: f.status === "ativo" ? "inativo" : "ativo" } : f)),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Fornecedores"
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
          <HeroMetric value="R$ 56.400,00" accent />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
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
                      { label: f.status === "ativo" ? "Desativar" : "Ativar", onClick: () => alternarStatus(f.id) },
                      { label: "Remover", onClick: () => remover(f.id), destructive: true },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
            {fornecedores.length === 0 && (
              <Tr>
                <Td className="text-text-tertiary text-center py-8" align="center">
                  Nenhum fornecedor cadastrado ainda.
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editandoId ? "Editar Fornecedor" : "Cadastrar Fornecedor"}
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
          <Button variant="primary" className="flex-1" onClick={salvar}>
            Salvar
          </Button>
        </div>
      </Modal>
    </>
  );
}
