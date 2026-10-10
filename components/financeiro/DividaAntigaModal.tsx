"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, formatarDataIso, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { parcelasDividaAntiga } from "@/lib/pagamentos";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { lancarDividaAntiga } from "@/app/(painel)/financeiro/pagamentos-actions";
import { lancarDividaAberta } from "@/app/(painel)/fornecedores/conta-aberta-actions";

export interface Pessoa {
  id: string;
  nome: string;
}

/** Onde o modal foi aberto: já sabe o lado (e às vezes quem). */
export interface InicioDividaAntiga {
  tipo: "pagar" | "receber";
  fornecedorId?: string | null;
  clienteId?: string | null;
}

/**
 * Lançar uma dívida ou conta de antes de usar o Sertão: o que você ainda deve a um
 * fornecedor, ou o crediário antigo de um cliente. As parcelas vão para o Financeiro, para
 * Fornecedores → "Em aberto" e para o limite do crediário do cliente. O "já pago" fica
 * registrado na parcela, mas não sai do caixa de hoje (foi pago antes do sistema).
 *
 * Montado com `key` por quem abre: o estado nasce do `inicio`.
 */
export function DividaAntigaModal({
  inicio,
  fornecedores,
  clientes,
  onClose,
}: {
  inicio: InicioDividaAntiga | null;
  fornecedores: Pessoa[];
  clientes: Pessoa[];
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<"pagar" | "receber">(inicio?.tipo ?? "pagar");
  const [fornecedorId, setFornecedorId] = useState(inicio?.fornecedorId ?? "");
  const [clienteId, setClienteId] = useState(inicio?.clienteId ?? "");
  const [descricao, setDescricao] = useState("Saldo anterior ao sistema");
  const [total, setTotal] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [primeiro, setPrimeiro] = useState(() => hojeIsoLocal());
  const [intervalo, setIntervalo] = useState(30);
  const [jaPago, setJaPago] = useState("");
  // Dívida que não é de fornecedor (o computador da empresa, um empréstimo, o cartão): o banco
  // aceita conta a pagar sem fornecedor; "com quem" vai na descrição.
  const [credor, setCredor] = useState("");
  // 0095: sem parcelas — vira saldo na conta em aberto do fornecedor, pago quando quiser.
  const [semParcelas, setSemParcelas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [inicial] = useState({ total: "", jaPago: "", parcelas: "1" });
  const sujo = useFormularioSujo({ total, jaPago, parcelas }, inicial);

  const totalN = numeroOuNulo(total) ?? 0;
  const jaPagoN = numeroOuNulo(jaPago) ?? 0;
  const nParcelas = Math.min(48, Math.max(1, Math.trunc(numeroOuNulo(parcelas) ?? 1)));
  const semFornecedor = tipo === "pagar" && fornecedorId === "SEM_FORNECEDOR";
  const podeSemParcelas = tipo === "pagar" && !!fornecedorId && !semFornecedor;
  const emContaAberta = podeSemParcelas && semParcelas;
  const quem = tipo === "pagar" ? fornecedorId : clienteId;
  const previa = useMemo(
    () => (totalN > 0 && primeiro && jaPagoN <= totalN ? parcelasDividaAntiga(totalN, jaPagoN, nParcelas, primeiro, intervalo) : []),
    [totalN, nParcelas, primeiro, intervalo, jaPagoN],
  );
  const emAberto = Math.max(0, Math.round((totalN - jaPagoN) * 100) / 100);
  const erro =
    !quem
      ? tipo === "pagar"
        ? "Escolha o fornecedor (ou \"Sem fornecedor\")."
        : "Escolha o cliente."
      : totalN <= 0
        ? "Informe o valor total."
        : jaPagoN > totalN
          ? "O já pago passa do total."
          : emContaAberta && totalN - jaPagoN <= 0
            ? "Não sobra nada em aberto. Use um valor maior que o já pago."
            : null;

  async function salvar() {
    if (erro) return;
    setSalvando(true);
    if (emContaAberta) {
      // Só o que ainda se deve entra na conta em aberto; o já pago ficou no passado, fora do caixa.
      const aberto = Math.round((totalN - jaPagoN) * 100) / 100;
      if (aberto <= 0) {
        setSalvando(false);
        return;
      }
      const r = await executarComToast(lancarDividaAberta({ fornecedor_id: fornecedorId, valor: aberto, data: null, descricao: descricao.trim() || null }), {
        sucesso: "Dívida lançada na conta em aberto do fornecedor",
        erro: "Erro ao lançar",
      });
      setSalvando(false);
      if (r.ok) onClose();
      return;
    }
    const r = await executarComToast(
      lancarDividaAntiga({
        tipo,
        fornecedor_id: tipo === "pagar" && !semFornecedor ? fornecedorId : null,
        cliente_id: tipo === "receber" ? clienteId : null,
        descricao: semFornecedor && credor.trim() ? `${descricao.trim()} — ${credor.trim()}`.slice(0, 150) : descricao.trim(),
        valor_total: totalN,
        parcelas: nParcelas,
        primeiro_vencimento: primeiro,
        intervalo_dias: intervalo,
        ja_pago: jaPagoN,
        conta_id: null,
      }),
      { sucesso: tipo === "pagar" ? "Dívida lançada no A pagar" : "Crediário antigo lançado no A receber", erro: "Erro ao lançar" },
    );
    setSalvando(false);
    if (r.ok) onClose();
  }

  return (
    <Modal open={!!inicio} onClose={onClose} title="Lançar dívida antiga" sujo={sujo} width="max-w-lg">
      <p className="text-sm text-text-secondary mb-4 flex gap-2">
        <History size={16} className="text-accent shrink-0 mt-0.5" />
        Para o que já existia antes de usar o Sertão. O valor já pago fica registrado, mas não sai do caixa de hoje.
      </p>
      {/* Aberta de Fornecedores (sem clientes) ou de um cliente (sem fornecedores): o lado já está decidido. */}
      {fornecedores.length > 0 && clientes.length > 0 && (
      <div className="flex gap-2 mb-4" role="group" aria-label="Tipo">
        <Button variant={tipo === "pagar" ? "primary" : "secondary"} className="flex-1" aria-pressed={tipo === "pagar"} onClick={() => setTipo("pagar")}>
          Eu devo
        </Button>
        <Button variant={tipo === "receber" ? "primary" : "secondary"} className="flex-1" aria-pressed={tipo === "receber"} onClick={() => setTipo("receber")}>
          Um cliente me deve
        </Button>
      </div>
      )}

      {tipo === "pagar" ? (
        <FormField label="Fornecedor">
          <select className={inputClass} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">Escolha…</option>
            <option value="SEM_FORNECEDOR">Sem fornecedor (equipamento, empréstimo, cartão…)</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField label="Cliente" dica="Entra no limite do crediário dele.">
          <select className={inputClass} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Escolha…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {semFornecedor && (
        <FormField label="Com quem / onde (opcional)" dica="Ex.: a loja onde comprou, o banco ou o cartão. Vai junto na descrição.">
          <input className={inputClass} value={credor} maxLength={60} onChange={(e) => setCredor(e.target.value)} placeholder="Ex.: Magazine Luiza" />
        </FormField>
      )}
      <FormField label="Descrição">
        <input className={inputClass} value={descricao} maxLength={150} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      {podeSemParcelas && (
        <label className="mb-3 flex items-start gap-2 rounded-md border border-border p-3 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={semParcelas} onChange={(e) => setSemParcelas(e.target.checked)} />
          <span>
            <span className="font-medium text-text-primary">Sem parcelas — eu pago quando puder</span>
            <span className="block text-xs text-text-tertiary">
              Fica como saldo em aberto com este fornecedor (sem vencimento, sem alerta de atraso). Você abate com Pix quando quiser, em Fornecedores → Conta em aberto.
            </span>
          </span>
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Valor total da dívida (R$)">
          <input className={inputClass} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label="Já pago (R$)" dica="Se já pagou uma parte antes.">
          <input className={inputClass} inputMode="decimal" value={jaPago} onChange={(e) => setJaPago(e.target.value)} placeholder="0,00" />
        </FormField>
        {!emContaAberta && (
          <FormField label="Parcelas">
            <input className={inputClass} inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
          </FormField>
        )}
        {!emContaAberta && (
          <FormField label="1º vencimento">
            <input type="date" className={inputClass} value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
          </FormField>
        )}
      </div>
      {emContaAberta && totalN > 0 && jaPagoN <= totalN && (
        <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          Entra na conta em aberto: <span className="font-mono text-text-primary">{formatBRL(emAberto)}</span>
          {jaPagoN > 0 ? ` (os ${formatBRL(jaPagoN)} já pagos ficam de fora)` : ""}.
        </p>
      )}
      {!emContaAberta && nParcelas > 1 && (
        <FormField label="Intervalo">
          <select className={inputClass} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            <option value={7}>Toda semana</option>
            <option value={15}>A cada 15 dias</option>
            <option value={30}>Todo mês</option>
          </select>
        </FormField>
      )}

      {totalN > 0 && jaPagoN > 0 && jaPagoN <= totalN && (
        <p className="text-xs text-text-secondary mb-2">
          {formatBRL(jaPagoN)} já pagos ficam registrados como quitados; as parcelas dividem só o que fica em aberto.
        </p>
      )}
      {!emContaAberta && previa.length > 0 && (
        <div className="rounded-md border border-border mb-4">
          <div className="flex justify-between px-3 py-2 text-sm border-b border-border bg-surface-2">
            <span className="text-text-secondary">Fica em aberto</span>
            <span className="font-mono font-semibold text-text-primary">{formatBRL(emAberto)}</span>
          </div>
          <ul className="max-h-40 overflow-y-auto divide-y divide-border text-xs">
            {previa.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
                <span className="text-text-secondary">
                  {i + 1}ª · vence {formatarDataIso(p.vencimento)}
                </span>
                <span className="font-mono text-text-primary">{formatBRL(p.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (total || quem) && <p className="text-xs text-negative mb-3">{erro}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={!!erro}>
          Lançar
        </Button>
      </div>
    </Modal>
  );
}
