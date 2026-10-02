"use client";

import { useState, useTransition } from "react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { ROTULO_STATUS_ASSINATURA, type Plano, type StatusAssinatura } from "@/lib/planos";
import { definirAssinaturaConta } from "@/app/(painel)/admin/planos-actions";

export interface AssinaturaConta {
  plano_id: string;
  status: StatusAssinatura;
  teste_ate: string | null;
  periodo_fim: string | null;
  plano_solicitado: string | null;
  solicitado_em: string | null;
  observacao: string | null;
}

const paraData = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
// Fim do dia em Brasília: "vale até 31/10" inclui o dia 31 inteiro.
const deData = (d: string) => (d ? `${d}T23:59:59-03:00` : null);

/** Admin → conta → Plano (10.9): o master ativa, estende ou rebaixa a assinatura. */
export function PlanoContaCard({ userId, planos, assinatura }: { userId: string; planos: Plano[]; assinatura: AssinaturaConta | null }) {
  const [pending, startTransition] = useTransition();
  const [plano, setPlano] = useState(assinatura?.plano_solicitado ?? assinatura?.plano_id ?? "pro");
  const [status, setStatus] = useState<StatusAssinatura>(assinatura?.plano_solicitado ? "ativa" : (assinatura?.status ?? "ativa"));
  const [periodo, setPeriodo] = useState(paraData(assinatura?.periodo_fim ?? null));
  const [teste, setTeste] = useState(paraData(assinatura?.teste_ate ?? null));
  const [obs, setObs] = useState(assinatura?.observacao ?? "");
  const solicitado = assinatura?.plano_solicitado ? planos.find((p) => p.id === assinatura.plano_solicitado) : null;

  function salvar() {
    startTransition(async () => {
      await executarComToast(
        definirAssinaturaConta({ user_id: userId, plano_id: plano, status, periodo_fim: deData(periodo), teste_ate: deData(teste), observacao: obs.trim() || null }),
        { sucesso: "Plano da conta atualizado", erro: "Erro ao salvar o plano" },
      );
    });
  }

  return (
    <Card className="mt-4 space-y-3 max-w-2xl">
      <CardEyebrow>Plano e assinatura</CardEyebrow>
      {solicitado && (
        <p className="text-sm rounded-md bg-accent-soft text-accent px-3 py-2">
          Pediu o plano {solicitado.nome}
          {assinatura?.solicitado_em ? ` em ${new Date(assinatura.solicitado_em).toLocaleDateString("pt-BR")}` : ""}. Confira o pagamento e salve como Ativa.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Plano">
          <select className={inputClass} value={plano} onChange={(e) => setPlano(e.target.value)}>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Situação">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as StatusAssinatura)}>
            {(Object.keys(ROTULO_STATUS_ASSINATURA) as StatusAssinatura[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_ASSINATURA[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Pago até (vazio = sem fim)">
          <input type="date" className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </FormField>
        <FormField label="Teste até">
          <input type="date" className={inputClass} value={teste} onChange={(e) => setTeste(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Observação (só o admin vê)">
        <input className={inputClass} maxLength={300} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Pix recebido em 02/10" />
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={salvar}>
          Salvar plano
        </Button>
      </div>
    </Card>
  );
}
