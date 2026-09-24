"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, ChevronLeft, CreditCard, Link2, MoreHorizontal, Smartphone, UserPlus, Wallet } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { criarClienteRapido } from "../clientes/actions";
import type { ClientePdv, ContaPdv } from "./tipos";

/** Ícone por forma de pagamento conhecida; o resto cai no genérico. */
const ICONES: { padrao: RegExp; icone: typeof Banknote }[] = [
  { padrao: /dinheiro|espécie|especie/i, icone: Banknote },
  { padrao: /pix/i, icone: Smartphone },
  { padrao: /cart|débito|debito|crédito|credito/i, icone: CreditCard },
  { padrao: /link/i, icone: Link2 },
  { padrao: /saldo/i, icone: Wallet },
];

function iconeDaForma(nome: string) {
  return ICONES.find((i) => i.padrao.test(nome))?.icone ?? MoreHorizontal;
}

export function CheckoutModal({
  aberto,
  onFechar,
  onVoltar,
  total,
  clientes,
  formasPagamento,
  contas,
  salvando,
  onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  onVoltar: () => void;
  total: number;
  clientes: ClientePdv[];
  formasPagamento: string[];
  contas: ContaPdv[];
  salvando: boolean;
  onConfirmar: (dados: {
    status: "paga" | "fiado";
    cliente_id: string | null;
    conta_id: string | null;
    forma_pagamento: string | null;
    data_vencimento: string | null;
  }) => void;
}) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<string | null>(formasPagamento[0] ?? null);
  const [contaId, setContaId] = useState<string | null>(contas[0]?.id ?? null);
  const [vencimento, setVencimento] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");
  const [novoFiado, setNovoFiado] = useState(false);
  const [criandoCliente, setCriandoCliente] = useState(false);
  const [clientesLocais, setClientesLocais] = useState<ClientePdv[]>(clientes);

  const cliente = clientesLocais.find((c) => c.id === clienteId) ?? null;
  const podeFiado = !!cliente?.permite_fiado;

  async function cadastrarCliente() {
    if (!novoNome.trim()) return;
    setCriandoCliente(true);
    try {
      const criado = await criarClienteRapido(novoNome.trim(), novoWhatsapp.trim() || null, novoFiado);
      setClientesLocais((prev) => [...prev, { ...criado, whatsapp: novoWhatsapp.trim() || null }]);
      setClienteId(criado.id);
      setCadastroAberto(false);
      setNovoNome("");
      setNovoWhatsapp("");
      setNovoFiado(false);
      toast.success("Cliente cadastrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar cliente");
    } finally {
      setCriandoCliente(false);
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Pagamento" width="max-w-2xl">
      <button
        onClick={onVoltar}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary -mt-1 mb-3"
      >
        <ChevronLeft size={16} />
        Voltar ao carrinho
      </button>

      <div className="text-center mb-5">
        <div className="font-mono text-4xl font-semibold text-text-primary">{formatBRL(total)}</div>
      </div>

      <FormField label="Cliente (opcional, obrigatório no fiado)">
        <div className="flex gap-2">
          <select
            className={inputClass}
            value={clienteId ?? ""}
            onChange={(e) => setClienteId(e.target.value || null)}
          >
            <option value="">Sem cliente identificado</option>
            {clientesLocais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.permite_fiado ? " (fiado liberado)" : ""}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => setCadastroAberto((v) => !v)}>
            <UserPlus size={14} />
          </Button>
        </div>
      </FormField>

      {cadastroAberto && (
        <div className="border border-border rounded-md p-3 mb-4 space-y-2">
          <input
            className={inputClass}
            placeholder="Nome do cliente"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Celular / WhatsApp (opcional)"
            value={novoWhatsapp}
            onChange={(e) => setNovoWhatsapp(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              checked={novoFiado}
              onChange={(e) => setNovoFiado(e.target.checked)}
            />
            Permitir fiado
          </label>
          <Button variant="secondary" className="w-full" onClick={cadastrarCliente} loading={criandoCliente}>
            Cadastrar e selecionar
          </Button>
        </div>
      )}

      <FormField label="Forma de pagamento">
        {formasPagamento.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            Nenhuma forma de pagamento cadastrada. Cadastre em Configurações — a venda pode seguir sem isso.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {formasPagamento.map((f) => {
              const Icone = iconeDaForma(f);
              const ativo = formaPagamento === f;
              return (
                <button
                  key={f}
                  onClick={() => setFormaPagamento(f)}
                  className={`h-16 rounded-md border flex flex-col items-center justify-center gap-1 text-sm transition-colors ${
                    ativo
                      ? "bg-accent-soft border-accent-soft text-accent"
                      : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Icone size={18} />
                  {f}
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      <FormField label="Conta que recebe">
        <select className={inputClass} value={contaId ?? ""} onChange={(e) => setContaId(e.target.value || null)}>
          <option value="">Selecione…</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>

      {podeFiado && (
        <FormField label="Vencimento do fiado (opcional — padrão 30 dias)">
          <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </FormField>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-5">
        {cliente && (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!podeFiado || salvando}
            title={podeFiado ? undefined : `${cliente.nome} não tem fiado liberado`}
            onClick={() =>
              onConfirmar({
                status: "fiado",
                cliente_id: clienteId,
                conta_id: contaId,
                forma_pagamento: formaPagamento,
                data_vencimento: vencimento || null,
              })
            }
          >
            Venda Fiado
          </Button>
        )}
        <Button
          variant="primary"
          className="flex-1"
          loading={salvando}
          onClick={() =>
            onConfirmar({
              status: "paga",
              cliente_id: clienteId,
              conta_id: contaId,
              forma_pagamento: formaPagamento,
              data_vencimento: null,
            })
          }
        >
          Finalizar Venda
        </Button>
      </div>
    </Modal>
  );
}
