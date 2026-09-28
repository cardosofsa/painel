"use client";

import { useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { atualizarVenda } from "./actions";
import type { Venda } from "./VendasClient";
import { executarComToast } from "@/lib/acao-cliente";

export interface ClienteOpcao {
  id: string;
  nome: string;
}

/**
 * Só edita o que não mexe em estoque nem, na maioria dos casos, no valor já lançado
 * (a RPC `editar_venda` ajusta o financeiro quando desconto/entrega mudam o total).
 * Para corrigir um item errado, o caminho é cancelar e refazer a venda.
 */
export function EditarVendaModal({
  venda,
  clientes,
  formasPagamento,
  onClose,
  onSalvo,
}: {
  venda: Venda | null;
  clientes: ClienteOpcao[];
  formasPagamento: string[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(venda?.cliente_id ?? null);
  const [formaPagamento, setFormaPagamento] = useState<string | null>(venda?.forma_pagamento ?? null);
  const [observacao, setObservacao] = useState(venda?.observacao ?? "");
  const [desconto, setDesconto] = useState(venda?.desconto ?? 0);
  const [valorEntrega, setValorEntrega] = useState(venda?.valor_entrega ?? 0);
  const [pin, setPin] = useState("");

  async function salvar() {
    if (!venda) return;
    setSalvando(true);
    const r = await executarComToast(
      atualizarVenda(venda.id, {
        cliente_id: clienteId,
        forma_pagamento: formaPagamento,
        observacao: observacao.trim() || null,
        desconto,
        valor_entrega: valorEntrega,
        pin,
      }),
      { sucesso: `Venda ${venda.numero} atualizada`, erro: "Erro ao editar venda" },
    );
    setSalvando(false);
    if (r.ok) onSalvo();
  }

  return (
    <Modal open={!!venda} onClose={onClose} title={venda ? `Editar Venda ${venda.numero}` : ""}>
      <FormField label="Cliente">
        <select className={inputClass} value={clienteId ?? ""} onChange={(e) => setClienteId(e.target.value || null)}>
          <option value="">Sem cliente identificado</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Forma de pagamento">
        <select className={inputClass} value={formaPagamento ?? ""} onChange={(e) => setFormaPagamento(e.target.value || null)}>
          <option value="">Não informada</option>
          {formasPagamento.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Desconto (R$)">
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={desconto}
            onChange={(e) => setDesconto(Number(e.target.value) || 0)}
          />
        </FormField>
        <FormField label="Entrega (R$)">
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={valorEntrega}
            onChange={(e) => setValorEntrega(Number(e.target.value) || 0)}
          />
        </FormField>
      </div>

      <FormField label="Observação">
        <textarea
          className={`${inputClass} h-16 py-2 resize-none`}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </FormField>

      <FormField label="PIN de administração">
        <input
          type="password"
          inputMode="numeric"
          className={inputClass}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Cadastrado em Configurações → Conta"
        />
      </FormField>

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={!pin}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
