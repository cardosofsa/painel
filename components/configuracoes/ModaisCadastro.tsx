"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
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
  const editando = !!conta && conta !== "novo";
  const base = conta && conta !== "novo" ? conta : { nome: "", saldo: 0, detalhe: "", tipo: "conta" as const, limite_total: null, dia_fechamento: null, dia_vencimento: null };
  const [nome, setNome] = useState(base.nome);
  const [tipo, setTipo] = useState<"conta" | "cartao_credito">(base.tipo ?? "conta");
  // No cartão o saldo é a dívida em negativo; a tela mostra "quanto já usou" em positivo.
  const [saldo, setSaldo] = useState(base.tipo === "cartao_credito" ? Math.max(0, -base.saldo) : base.saldo);
  const [detalhe, setDetalhe] = useState(base.detalhe);
  const [limite, setLimite] = useState(base.limite_total ?? 0);
  const [fechamento, setFechamento] = useState(base.dia_fechamento ?? 0);
  const [vencimento, setVencimento] = useState(base.dia_vencimento ?? 0);
  const [inicial] = useState({ nome: base.nome, tipo: base.tipo ?? "conta", saldo: base.tipo === "cartao_credito" ? Math.max(0, -base.saldo) : base.saldo, detalhe: base.detalhe, limite: base.limite_total ?? 0, fechamento: base.dia_fechamento ?? 0, vencimento: base.dia_vencimento ?? 0 });
  const sujo = useFormularioSujo({ nome, tipo, saldo, detalhe, limite, fechamento, vencimento }, inicial);
  const cartao = tipo === "cartao_credito";
  const disponivel = Math.max(0, limite - saldo);

  function salvar() {
    if (!cartao) return onSave({ nome, saldo, detalhe });
    onSave({ nome, saldo: -saldo, detalhe, tipo, limite_total: limite || null, dia_fechamento: fechamento || null, dia_vencimento: vencimento || null });
  }

  return (
    <Modal open={!!conta} onClose={onClose} title={conta === "novo" ? "Adicionar Conta" : "Editar Conta"} sujo={sujo}>
      <FormField label="Nome da Conta">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={cartao ? "Ex: Cartão Nubank" : undefined} />
      </FormField>
      <FormField
        label="Tipo"
        dica={editando ? "O tipo não muda depois de criada. Para trocar, cadastre outra conta." : "Cartão de crédito tem limite e fatura: o gasto não sai do saldo das contas, só quando você paga a fatura."}
      >
        <select className={inputClass} value={tipo} disabled={editando} onChange={(e) => setTipo(e.target.value as "conta" | "cartao_credito")}>
          <option value="conta">Conta (caixa, banco, Pix)</option>
          <option value="cartao_credito">Cartão de crédito</option>
        </select>
      </FormField>
      {cartao ? (
        <>
          <FormField label="Limite total (R$)">
            <CampoNumero className={inputClass} value={limite} onChange={(n) => setLimite(n)} />
          </FormField>
          <FormField label="Quanto já usou do limite (R$)" dica="É a fatura em aberto hoje. O limite disponível é o limite menos o que já usou.">
            <CampoNumero className={inputClass} value={saldo} onChange={(n) => setSaldo(n)} />
          </FormField>
          <p className="text-xs text-text-secondary -mt-2 mb-3">
            Limite disponível: <span className="font-mono text-text-primary">{formatBRL(disponivel)}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fecha no dia">
              <CampoNumero className={inputClass} value={fechamento} onChange={(n) => setFechamento(Math.round(n))} />
            </FormField>
            <FormField label="Vence no dia">
              <CampoNumero className={inputClass} value={vencimento} onChange={(n) => setVencimento(Math.round(n))} />
            </FormField>
          </div>
        </>
      ) : (
        <FormField label="Saldo Atual (R$)">
          <CampoNumero className={inputClass} value={saldo} onChange={(n) => setSaldo(n)} />
        </FormField>
      )}
      <FormField label="Detalhe">
        <input className={inputClass} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex: Conta corrente PJ" />
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

export const ROTULO_TIPO_FORMA: Record<TipoFormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_debito: "Cartão de Débito",
  cartao_credito: "Cartão de Crédito",
  fiado: "Crediário",
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
        dica="Define o comportamento no PDV: dinheiro/pix entram como entrada; cartão de crédito mostra vezes e taxa de maquineta; crediário não aparece na grade de pagamento (é o botão 'Venda no crediário')."
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
  lojas: lojasCadastradas,
  onClose,
  onSave,
  salvando,
}: {
  armazem: Armazem | "novo" | null;
  /** Lojas cadastradas em Canais de Venda, para marcar quais este armazém abastece. */
  lojas: { id: string; nome: string; canal: string }[];
  onClose: () => void;
  onSave: (dados: ArmazemInput) => void;
  salvando: boolean;
}) {
  const base = armazem && armazem !== "novo" ? armazem : { nome: "", endereco: "", lojas_abastecidas: [] as string[], loja_ids: [] as string[] };
  const [nome, setNome] = useState(base.nome);
  const [endereco, setEndereco] = useState(base.endereco);
  // Marcadas: pelos ids (0041) ou, em cadastro antigo, pelo nome que bate com uma loja.
  const [marcadas, setMarcadas] = useState<string[]>(() =>
    base.loja_ids?.length
      ? base.loja_ids
      : lojasCadastradas.filter((l) => base.lojas_abastecidas.some((n) => n.trim().toLowerCase() === l.nome.trim().toLowerCase())).map((l) => l.id),
  );
  // Nomes antigos que não viraram loja cadastrada continuam, para não sumirem sem aviso.
  const [avulsas] = useState(() => base.lojas_abastecidas.filter((n) => !lojasCadastradas.some((l) => l.nome.trim().toLowerCase() === n.trim().toLowerCase())));
  const [inicial] = useState({ nome: base.nome, endereco: base.endereco, marcadas: [...marcadas].sort().join(",") });
  const sujo = useFormularioSujo({ nome, endereco, marcadas: [...marcadas].sort().join(",") }, inicial);

  function alternar(id: string) {
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  return (
    <Modal open={!!armazem} onClose={onClose} title={armazem === "novo" ? "Adicionar Armazém" : "Editar Armazém"} sujo={sujo}>
      <FormField label="Nome">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Galpão Central" />
      </FormField>
      <FormField label="Endereço">
        <input className={inputClass} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
      </FormField>
      <FormField label="Lojas abastecidas">
        {lojasCadastradas.length === 0 ? (
          <p className="text-xs text-text-tertiary">Cadastre suas lojas em Canais de Venda para marcar aqui quais este armazém abastece.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
            {lojasCadastradas.map((l) => (
              <label key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-2">
                <input type="checkbox" className="w-4 h-4 accent-accent" checked={marcadas.includes(l.id)} onChange={() => alternar(l.id)} />
                <span className="text-text-primary">{l.nome}</span>
                {l.canal && <span className="text-xs text-text-tertiary ml-auto">{l.canal}</span>}
              </label>
            ))}
          </div>
        )}
        {avulsas.length > 0 && <p className="text-xs text-text-tertiary mt-1">Também registradas antes: {avulsas.join(", ")}.</p>}
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
              lojas_abastecidas: [...lojasCadastradas.filter((l) => marcadas.includes(l.id)).map((l) => l.nome), ...avulsas],
              loja_ids: marcadas,
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
