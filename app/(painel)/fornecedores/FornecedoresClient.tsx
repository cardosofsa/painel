"use client";

import { useState, useTransition } from "react";
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
import Link from "next/link";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { criarFornecedor, atualizarFornecedor, removerFornecedor, alternarStatusFornecedor, type FornecedorInput } from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { DividaAntigaModal, type InicioDividaAntiga } from "@/components/financeiro/DividaAntigaModal";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";

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
  emAberto,
}: {
  fornecedores: Fornecedor[];
  comprasNoTrimestre: number;
  /** Quanto falta pagar por fornecedor (0064); null = migração ausente. */
  emAberto: Record<string, { valor: number; atrasado: number; proximo: string | null }> | null;
}) {
  const [pending, startTransition] = useTransition();
  const totalAberto = Object.values(emAberto ?? {}).reduce((s, a) => s + a.valor, 0);
  const totalAtrasado = Object.values(emAberto ?? {}).reduce((s, a) => s + a.atrasado, 0);
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalAberto, setModalAberto] = useState(false);
  // Dívida de antes do sistema com um fornecedor (0067).
  const [divida, setDivida] = useState<InicioDividaAntiga | null>(null);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<FornecedorInput>(FORM_VAZIO);
  const [formOriginal, setFormOriginal] = useState<FornecedorInput>(FORM_VAZIO);
  const sujo = useFormularioSujo(form, formOriginal);

  const ativos = fornecedores.filter((f) => f.status === "ativo").length;

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setFormOriginal(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    const dados = { nome: f.nome, cnpj: f.cnpj, contato: f.contato, telefone: f.telefone, cidade: f.cidade, prazo: f.prazo, status: f.status };
    setForm(dados);
    setFormOriginal(dados);
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    startTransition(async () => {
      const r = editando
        ? await executarComToast(atualizarFornecedor(editando.id, form), {
            sucesso: "Fornecedor atualizado",
            erro: "Erro ao salvar fornecedor",
          })
        : await executarComToast(criarFornecedor(form), {
            sucesso: "Fornecedor cadastrado",
            erro: "Erro ao salvar fornecedor",
          });
      if (r.ok) setModalAberto(false);
    });
  }

  async function remover(f: Fornecedor) {
    const ok = await confirm({
      title: "Remover fornecedor?",
      message: `"${f.nome}" será removido definitivamente. Essa ação não pode ser desfeita.`,
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerFornecedor(f.id), { sucesso: "Fornecedor removido", erro: "Erro ao remover fornecedor" });
    });
  }

  function alternarStatus(f: Fornecedor) {
    startTransition(async () => {
      await executarComToast(alternarStatusFornecedor(f.id, f.status), { erro: "Erro ao atualizar status" });
    });
  }

  return (
    <>
      <PageHeader
        title="Fornecedores"
        actions={
          <>
            <Button variant="secondary" onClick={() => setDivida({ tipo: "pagar" })} disabled={fornecedores.length === 0}>
              Lançar dívida antiga
            </Button>
            <Button variant="primary" onClick={abrirNovo}>+ Cadastrar Fornecedor</Button>
          </>
        }
      />

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${emAberto ? "lg:grid-cols-3" : ""} gap-4 mb-5`}>
        <Card>
          <CardEyebrow>Fornecedores Cadastrados</CardEyebrow>
          <HeroMetric value={String(fornecedores.length)} caption={`${ativos} ativos`} />
        </Card>
        <Card>
          <CardEyebrow>Compras no Trimestre</CardEyebrow>
          <HeroMetric value={formatBRL(comprasNoTrimestre)} accent />
        </Card>
        {emAberto && (
          <Card>
            <CardEyebrow>A pagar a fornecedores</CardEyebrow>
            <HeroMetric value={formatBRL(totalAberto)} caption={totalAtrasado > 0 ? `${formatBRL(totalAtrasado)} atrasado` : "nada atrasado"} />
            <Link href="/financeiro?aba=a-pagar" className="text-xs text-accent hover:underline mt-3 inline-block">
              Ver no Financeiro ›
            </Link>
          </Card>
        )}
      </div>

      <Card padding="nenhum" className="overflow-hidden">
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
                {emAberto && <Th align="right">Em aberto</Th>}
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
                  {emAberto && (
                    <Td align="right">
                      {emAberto[f.id] ? (
                        <div>
                          <div className={`font-mono ${emAberto[f.id].atrasado > 0 ? "text-negative" : "text-text-primary"}`}>{formatBRL(emAberto[f.id].valor)}</div>
                          <div className="text-xs text-text-tertiary">
                            {emAberto[f.id].atrasado > 0 ? `${formatBRL(emAberto[f.id].atrasado)} atrasado` : emAberto[f.id].proximo ? `vence ${formatarDataIso(emAberto[f.id].proximo)}` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </Td>
                  )}
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
                        { label: "Lançar dívida antiga", onClick: () => setDivida({ tipo: "pagar", fornecedorId: f.id }) },
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
        sujo={sujo}
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
      <DividaAntigaModal
        key={`divida-${divida?.fornecedorId ?? divida?.tipo ?? "fechado"}`}
        inicio={divida}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
        clientes={[]}
        onClose={() => setDivida(null)}
      />
    </>
  );
}
