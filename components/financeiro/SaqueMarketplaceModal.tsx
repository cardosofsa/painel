"use client";

import { useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { registrarSaqueMarketplace } from "@/app/(painel)/financeiro/saque-actions";
import { toast } from "sonner";

/**
 * Registrar o saque da carteira da Shopee/ML para o banco. Montado só quando aberto
 * (`{aberto && <SaqueMarketplaceModal … />}`): o estado nasce limpo a cada abertura.
 */
export function SaqueMarketplaceModal({
  lojas,
  contas,
  liberadoPorLoja,
  lojaInicial,
  onClose,
}: {
  lojas: { id: string; nome: string; canal: string }[];
  contas: { id: string; nome: string }[];
  /** Quanto há de repasse de pedidos concluídos por nome de loja, só para orientar. */
  liberadoPorLoja: Record<string, number>;
  lojaInicial: string | null;
  onClose: () => void;
}) {
  const hoje = hojeIsoLocal();
  const [lojaId, setLojaId] = useState(lojas.find((l) => l.nome === lojaInicial)?.id ?? lojas[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const v = numeroOuNulo(valor);
  const loja = lojas.find((l) => l.id === lojaId);
  const liberado = loja ? liberadoPorLoja[loja.nome] : undefined;

  async function confirmar() {
    if (v === null || v <= 0 || !lojaId || !contaId) return;
    setSalvando(true);
    const r = await executarComToast(registrarSaqueMarketplace({ loja_id: lojaId, valor: v, conta_id: contaId, data }), { erro: "Erro ao registrar o saque" });
    setSalvando(false);
    if (!r.ok) return;
    const { baixados, diferenca } = r.dado;
    toast.success(baixados > 0 ? `Saque registrado: ${baixados} ${baixados === 1 ? "repasse baixado" : "repasses baixados"}` : "Saque registrado");
    if (Math.abs(diferenca) >= 0.05) toast.message(`O saque ficou ${formatBRL(Math.abs(diferenca))} ${diferenca > 0 ? "acima" : "abaixo"} dos repasses baixados (taxas ou valores ainda não liberados).`);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Registrei um saque">
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          Quando você saca o dinheiro da Shopee ou do Mercado Livre para o banco, informe aqui o valor que caiu. O saldo da conta sobe e os repasses mais antigos da loja são baixados até esse valor.
        </p>
        <FormField label="Loja">
          <select className={inputClass} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.canal} · {l.nome}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Valor que caiu na conta (R$)">
            <input type="text" inputMode="decimal" className={inputClass} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </FormField>
          <FormField label="Data do saque">
            <input type="date" className={inputClass} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </FormField>
        </div>
        {liberado !== undefined && <p className="text-xs text-text-tertiary">Repasses de pedidos concluídos desta loja: {formatBRL(liberado)}.</p>}
        <FormField label="Conta que recebeu">
          <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={confirmar} loading={salvando} disabled={v === null || v <= 0 || !lojaId || !contaId}>
            Registrar saque
          </Button>
        </div>
      </div>
    </Modal>
  );
}
