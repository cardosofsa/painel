"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import type { ContaInput, ArmazemInput, FormaPagamentoInput, TipoFormaPagamento } from "@/app/(painel)/configuracoes/actions";
import type { Conta, Armazem, FormaPagamento } from "@/app/(painel)/configuracoes/ConfiguracoesClient";

/** Modais de cadastro simples: conta bancária, forma de pagamento e armazém. */
export function ContaModal({
  conta,
  onClose,
  onSave,
  salvando,
}: {
  conta: Conta | "novo" | null;
  onClose: () => void;
  onSave: (dados: ContaInput) => void;
  salvando: boolean;
}) {
  const base = conta && conta !== "novo" ? conta : { nome: "", saldo: 0, detalhe: "" };
  const [nome, setNome] = useState(base.nome);
  const [saldo, setSaldo] = useState(base.saldo);
  const [detalhe, setDetalhe] = useState(base.detalhe);
  const [inicial] = useState({ nome: base.nome, saldo: base.saldo, detalhe: base.detalhe });
  const sujo = useFormularioSujo({ nome, saldo, detalhe }, inicial);

  return (
    <Modal open={!!conta} onClose={onClose} title={conta === "novo" ? "Adicionar Conta" : "Editar Conta"} sujo={sujo}>
      <FormField label="Nome da Conta">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
      </FormField>
      <FormField label="Saldo Atual (R$)">
        <input type="number" step="0.01" className={inputClass} value={saldo} onChange={(e) => setSaldo(Number(e.target.value) || 0)} />
      </FormField>
      <FormField label="Detalhe">
        <input className={inputClass} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex: Conta corrente PJ" />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, saldo, detalhe })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export const ROTULO_TIPO_FORMA: Record<TipoFormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_debito: "Cartão de Débito",
  cartao_credito: "Cartão de Crédito",
  fiado: "Fiado",
  outro: "Outro",
};

export function FormaPagamentoModal({
  formaPagamento,
  onClose,
  onSave,
  salvando,
}: {
  formaPagamento: FormaPagamento | "novo" | null;
  onClose: () => void;
  onSave: (dados: FormaPagamentoInput) => void;
  salvando: boolean;
}) {
  const base = formaPagamento && formaPagamento !== "novo" ? formaPagamento : { nome: "", tipo: "outro" as const };
  const [nome, setNome] = useState(base.nome);
  const [tipo, setTipo] = useState<TipoFormaPagamento>(base.tipo);
  const [inicial] = useState({ nome: base.nome, tipo: base.tipo });
  const sujo = useFormularioSujo({ nome, tipo }, inicial);

  return (
    <Modal
      open={!!formaPagamento}
      onClose={onClose}
      title={formaPagamento === "novo" ? "Adicionar Forma de Pagamento" : "Editar Forma de Pagamento"}
      sujo={sujo}
    >
      <FormField label="Nome">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pix, Cartão Nubank" />
      </FormField>
      <FormField
        label="Tipo"
        dica="Define o comportamento no PDV: dinheiro/pix entram como entrada; cartão de crédito mostra vezes e taxa de maquineta; fiado não aparece na grade de pagamento (é o botão 'Venda Fiado')."
      >
        <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoFormaPagamento)}>
          {(Object.keys(ROTULO_TIPO_FORMA) as TipoFormaPagamento[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_FORMA[t]}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, tipo })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export function ArmazemModal({
  armazem,
  onClose,
  onSave,
  salvando,
}: {
  armazem: Armazem | "novo" | null;
  onClose: () => void;
  onSave: (dados: ArmazemInput) => void;
  salvando: boolean;
}) {
  const base = armazem && armazem !== "novo" ? armazem : { nome: "", endereco: "", lojas_abastecidas: [] as string[] };
  const [nome, setNome] = useState(base.nome);
  const [endereco, setEndereco] = useState(base.endereco);
  const [lojas, setLojas] = useState(base.lojas_abastecidas.join(", "));
  const [inicial] = useState({ nome: base.nome, endereco: base.endereco, lojas: base.lojas_abastecidas.join(", ") });
  const sujo = useFormularioSujo({ nome, endereco, lojas }, inicial);

  return (
    <Modal open={!!armazem} onClose={onClose} title={armazem === "novo" ? "Adicionar Armazém" : "Editar Armazém"} sujo={sujo}>
      <FormField label="Nome">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Galpão Central" />
      </FormField>
      <FormField label="Endereço">
        <input className={inputClass} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
      </FormField>
      <FormField label="Lojas Abastecidas">
        <input
          className={inputClass}
          value={lojas}
          onChange={(e) => setLojas(e.target.value)}
          placeholder="Separe por vírgula: Perfumaria & Couro, Moto Parts"
        />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              nome,
              endereco,
              lojas_abastecidas: lojas
                .split(",")
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
          loading={salvando}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
