"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal, FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format";
import {
  criarCliente,
  atualizarCliente,
  removerCliente,
  alternarStatusCliente,
  type ClienteInput,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";

export interface Cliente extends ClienteInput {
  id: string;
  compras: number;
  total_comprado: number;
}

const FORM_VAZIO: ClienteInput = {
  nome: "",
  whatsapp: null,
  email: null,
  documento: null,
  data_nascimento: null,
  cep: null,
  endereco: null,
  cidade: null,
  uf: null,
  observacao: null,
  permite_fiado: false,
  status: "ativo",
};

export function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteInput>(FORM_VAZIO);
  const [opcionaisAbertos, setOpcionaisAbertos] = useState(false);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.whatsapp ?? "").toLowerCase().includes(termo) ||
        (c.documento ?? "").toLowerCase().includes(termo),
    );
  }, [clientes, busca]);

  const comFiado = clientes.filter((c) => c.permite_fiado).length;
  const totalComprado = clientes.reduce((acc, c) => acc + c.total_comprado, 0);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setOpcionaisAbertos(false);
    setModalAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c);
    setForm({
      nome: c.nome,
      whatsapp: c.whatsapp,
      email: c.email,
      documento: c.documento,
      data_nascimento: c.data_nascimento,
      cep: c.cep,
      endereco: c.endereco,
      cidade: c.cidade,
      uf: c.uf,
      observacao: c.observacao,
      permite_fiado: c.permite_fiado,
      status: c.status,
    });
    setOpcionaisAbertos(false);
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome.trim()) return;
    startTransition(async () => {
      const r = editando
        ? await executarComToast(atualizarCliente(editando.id, form), {
            sucesso: "Cliente atualizado",
            erro: "Erro ao salvar cliente",
          })
        : await executarComToast(criarCliente(form), {
            sucesso: "Cliente cadastrado",
            erro: "Erro ao salvar cliente",
          });
      if (r.ok) setModalAberto(false);
    });
  }

  async function remover(c: Cliente) {
    const ok = await confirm({
      title: "Remover cliente?",
      message: `"${c.nome}" será removido definitivamente. Essa ação não pode ser desfeita.`,
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerCliente(c.id), { sucesso: "Cliente removido", erro: "Erro ao remover cliente" });
    });
  }

  function alternarStatus(c: Cliente) {
    startTransition(async () => {
      await executarComToast(alternarStatusCliente(c.id, c.status), { erro: "Erro ao atualizar status" });
    });
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        actions={
          <Button variant="primary" onClick={abrirNovo}>
            + Cadastrar Cliente
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardEyebrow>Clientes Cadastrados</CardEyebrow>
          <HeroMetric value={String(clientes.length)} caption={`${comFiado} com fiado liberado`} />
        </Card>
        <Card>
          <CardEyebrow>Total Comprado</CardEyebrow>
          <HeroMetric value={formatBRL(totalComprado)} accent />
        </Card>
        <Card>
          <CardEyebrow>Ticket Médio por Cliente</CardEyebrow>
          <HeroMetric value={formatBRL(clientes.length > 0 ? totalComprado / clientes.length : 0)} />
        </Card>
      </div>

      <div className="mb-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, WhatsApp ou documento…"
          className={`${campoBase} w-full sm:w-80`}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState
            icon={Users}
            title={busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description={
              busca
                ? "Tente outro termo de busca."
                : "Cadastre seus clientes para registrar vendas no nome deles, liberar fiado e acompanhar o histórico de compras."
            }
            action={
              busca ? undefined : (
                <Button variant="primary" onClick={abrirNovo}>
                  + Cadastrar Cliente
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Cliente</Th>
                <Th>WhatsApp</Th>
                <Th>Cidade / UF</Th>
                <Th align="right">Compras</Th>
                <Th align="right">Total</Th>
                <Th>Fiado</Th>
                <Th>Status</Th>
                <Th align="right">Ações</Th>
              </tr>
            </Thead>
            <tbody>
              {filtrados.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className={c.status === "inativo" ? "line-through text-text-tertiary" : "text-text-primary"}>
                      {c.nome}
                    </div>
                    {c.documento ? <div className="text-xs text-text-tertiary font-mono">{c.documento}</div> : null}
                  </Td>
                  <Td mono>{c.whatsapp || "—"}</Td>
                  <Td>{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</Td>
                  <Td align="right" mono>
                    {c.compras}
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(c.total_comprado)}
                  </Td>
                  <Td>
                    {c.permite_fiado ? <StatusChip label="Liberado" tone="positive" /> : <span className="text-text-tertiary">—</span>}
                  </Td>
                  <Td>
                    <StatusChip
                      label={c.status === "ativo" ? "Ativo" : "Inativo"}
                      tone={c.status === "ativo" ? "positive" : "neutral"}
                    />
                  </Td>
                  <Td align="right">
                    <RowMenu
                      actions={[
                        { label: "Editar", onClick: () => abrirEdicao(c) },
                        { label: c.status === "ativo" ? "Desativar" : "Ativar", onClick: () => alternarStatus(c) },
                        { label: "Remover", onClick: () => remover(c), destructive: true },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar Cliente" : "Cadastrar Cliente"}>
        <FormField label="Nome">
          <input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </FormField>
        <FormField label="Celular / WhatsApp">
          <input
            className={inputClass}
            value={form.whatsapp ?? ""}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value || null })}
            placeholder="Ex: 11987654321"
          />
        </FormField>
        <FormField label="Endereço (opcional)">
          <input
            className={inputClass}
            value={form.endereco ?? ""}
            onChange={(e) => setForm({ ...form, endereco: e.target.value || null })}
          />
        </FormField>

        <button
          type="button"
          onClick={() => setOpcionaisAbertos((v) => !v)}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-3"
        >
          {opcionaisAbertos ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Opcionais
        </button>

        {opcionaisAbertos ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Data de aniversário">
                <input
                  type="date"
                  className={inputClass}
                  value={form.data_nascimento ?? ""}
                  onChange={(e) => setForm({ ...form, data_nascimento: e.target.value || null })}
                />
              </FormField>
              <FormField label="CPF / CNPJ">
                <input
                  className={inputClass}
                  value={form.documento ?? ""}
                  onChange={(e) => setForm({ ...form, documento: e.target.value || null })}
                />
              </FormField>
            </div>
            <FormField label="E-mail">
              <input
                className={inputClass}
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value || null })}
              />
            </FormField>
            <div className="grid grid-cols-[1fr_2fr_80px] gap-4">
              <FormField label="CEP">
                <input
                  className={inputClass}
                  value={form.cep ?? ""}
                  onChange={(e) => setForm({ ...form, cep: e.target.value || null })}
                />
              </FormField>
              <FormField label="Cidade">
                <input
                  className={inputClass}
                  value={form.cidade ?? ""}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value || null })}
                />
              </FormField>
              <FormField label="UF">
                <input
                  className={inputClass}
                  maxLength={2}
                  value={form.uf ?? ""}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() || null })}
                />
              </FormField>
            </div>
            <FormField label="Observação">
              <textarea
                className={`${inputClass} h-20 py-2 resize-none`}
                value={form.observacao ?? ""}
                onChange={(e) => setForm({ ...form, observacao: e.target.value || null })}
              />
            </FormField>
          </>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer mt-1">
          <input
            type="checkbox"
            className="w-4 h-4 accent-accent"
            checked={form.permite_fiado}
            onChange={(e) => setForm({ ...form, permite_fiado: e.target.checked })}
          />
          Permitir fiado
        </label>
        <p className="text-xs text-text-tertiary mt-1">
          Libera a opção &quot;Venda Fiado&quot; no PDV para este cliente. A venda vira uma conta a receber em vez de entrar no caixa.
        </p>

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
