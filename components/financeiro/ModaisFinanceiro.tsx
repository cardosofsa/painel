"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { hojeIsoLocal } from "@/lib/format";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import type { Conta } from "@/app/(painel)/financeiro/FinanceiroClient";
import type {
  MovimentacaoInput,
  DespesaFixaInput,
  ContaPagarReceberInput,
} from "@/app/(painel)/financeiro/actions";

/** Formulários do financeiro: lançamento avulso, despesa fixa e conta a pagar/receber. */
export function NovaMovimentacaoModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: MovimentacaoInput) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [valor, setValor] = useState(0);
  const [afetaLucro, setAfetaLucro] = useState(true);
  const [inicial] = useState({ tipo, descricao, categoria, contaId, valor, afetaLucro });
  const sujo = useFormularioSujo({ tipo, descricao, categoria, contaId, valor, afetaLucro }, inicial);

  function salvar() {
    if (!descricao.trim()) return toast.error("Descreva o lançamento.");
    if (valor <= 0) return toast.error("O valor precisa ser maior que zero.");
    if (!contaId) return toast.error("Escolha a conta do lançamento.");
    onSave({
      tipo,
      valor,
      descricao,
      origem: "Lançamento manual",
      categoria: categoria || "Outros",
      conta_id: contaId,
      afeta_lucro: afetaLucro,
      data_movimentacao: hojeIsoLocal(),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Entrada / Saída" sujo={sujo}>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTipo("entrada")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "entrada" ? "bg-positive-soft border-positive/30 text-positive font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          Entrada
        </button>
        <button
          onClick={() => setTipo("saida")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "saida" ? "bg-negative-soft border-negative/30 text-negative font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          Saída
        </button>
      </div>
      <FormField label="Descrição">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <FormField label="Categoria">
        <input className={inputClass} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Matéria-prima, Receita vendas…" />
      </FormField>
      <FormField label="Conta">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Valor (R$)">
        <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
      </FormField>
      <label className="flex items-center gap-2 mb-1 cursor-pointer">
        <input type="checkbox" checked={afetaLucro} onChange={(e) => setAfetaLucro(e.target.checked)} className="w-4 h-4 accent-accent" />
        <span className="text-sm text-text-secondary">Afeta o lucro (desmarque para compras de estoque, por ex.)</span>
      </label>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export function NovaDespesaFixaModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: DespesaFixaInput) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState("");
  const [metodo, setMetodo] = useState("");
  const [valor, setValor] = useState(0);
  const [dia, setDia] = useState(5);
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [inicial] = useState({ nome, metodo, valor, dia, contaId });
  const sujo = useFormularioSujo({ nome, metodo, valor, dia, contaId }, inicial);

  function salvar() {
    if (!nome.trim()) return toast.error("Dê um nome para a despesa fixa.");
    if (valor <= 0) return toast.error("O valor precisa ser maior que zero.");
    onSave({ nome, metodo: metodo || null, valor, dia_vencimento: dia, conta_id: contaId || null });
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Despesa Fixa" sujo={sujo}>
      <FormField label="Identificador">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Aluguel, Internet…" />
      </FormField>
      <FormField label="Método de Cobrança">
        <input className={inputClass} value={metodo} onChange={(e) => setMetodo(e.target.value)} placeholder="Ex: Boleto manual" />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Valor Mensal (R$)">
          <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Dia de Cobrança">
          <input
            type="number"
            min={1}
            max={31}
            className={inputClass}
            value={dia}
            onChange={(e) => setDia(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
          />
        </FormField>
      </div>
      <FormField label="Conta Vinculada">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export function NovaCprModal({
  open,
  onClose,
  contas,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  contas: Conta[];
  onSave: (dados: ContaPagarReceberInput) => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [vencimento, setVencimento] = useState(() => hojeIsoLocal());
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [inicial] = useState({ tipo, descricao, valor, vencimento, contaId });
  const sujo = useFormularioSujo({ tipo, descricao, valor, vencimento, contaId }, inicial);

  function salvar() {
    if (!descricao.trim()) return toast.error("Descreva a conta a pagar ou receber.");
    if (valor <= 0) return toast.error("O valor precisa ser maior que zero.");
    onSave({ tipo, descricao, valor, data_vencimento: vencimento, conta_id: contaId || null });
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Conta a Pagar/Receber" sujo={sujo}>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTipo("pagar")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "pagar" ? "bg-negative-soft border-negative/30 text-negative font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          A Pagar
        </button>
        <button
          onClick={() => setTipo("receber")}
          className={`flex-1 h-9 rounded-md text-sm border ${tipo === "receber" ? "bg-positive-soft border-positive/30 text-positive font-medium" : "bg-surface-1 border-border text-text-secondary"}`}
        >
          A Receber
        </button>
      </div>
      <FormField label="Descrição">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Valor (R$)">
          <input type="number" step="0.01" className={inputClass} value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Vencimento">
          <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Conta">
        <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
