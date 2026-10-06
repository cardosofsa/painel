"use client";

import { useState, useTransition } from "react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import type { Plano } from "@/lib/planos";
import { salvarPlano } from "@/app/(painel)/admin/planos-actions";

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v.replace(",", ".")) || 0)));

/** Master → Planos (10.9): preço e limites de cada plano (vazio = ilimitado). */
export function PlanosEditor({ planos }: { planos: Plano[] | null }) {
  if (planos === null)
    return (
      <Card className="p-5 text-sm text-text-secondary">
        Planos precisam da migração <span className="font-mono">0057_planos_assinaturas.sql</span>.
      </Card>
    );
  return (
    <Card className="space-y-3">
      <CardEyebrow>Planos</CardEyebrow>
      <p className="text-xs text-text-tertiary">Limites em branco = ilimitado. A mudança vale na hora para todas as contas do plano.</p>
      {planos.map((p) => (
        <LinhaPlano key={p.id} inicial={p} />
      ))}
    </Card>
  );
}

function LinhaPlano({ inicial }: { inicial: Plano }) {
  const [pending, startTransition] = useTransition();
  const [p, setP] = useState(inicial);
  const campo = (k: keyof Plano, rotulo: string) => (
    <label className="text-[11px] text-text-tertiary">
      {rotulo}
      <input className={`${inputClass} h-8`} inputMode="numeric" value={(p[k] as number | null) ?? ""} onChange={(e) => setP((x) => ({ ...x, [k]: num(e.target.value) }))} placeholder="∞" />
    </label>
  );
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
        <label className="text-[11px] text-text-tertiary">
          Nome
          <input className={`${inputClass} h-8`} value={p.nome} onChange={(e) => setP((x) => ({ ...x, nome: e.target.value }))} />
        </label>
        <label className="text-[11px] text-text-tertiary">
          Preço/mês (R$)
          <input
            className={`${inputClass} h-8`}
            inputMode="decimal"
            value={p.preco_mensal}
            onChange={(e) => setP((x) => ({ ...x, preco_mensal: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) }))}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary h-8">
          <input type="checkbox" checked={p.ativo} onChange={(e) => setP((x) => ({ ...x, ativo: e.target.checked }))} /> Ativo
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {campo("limite_produtos", "Produtos")}
        {campo("limite_lojas", "Lojas API")}
        {campo("limite_usuarios", "Usuários")}
        {campo("limite_ia_mes", "IA/mês")}
        {p.limite_imagens_mes !== undefined && campo("limite_imagens_mes", "Imagens IA/mês")}
      </div>
      <div className="flex items-center gap-2">
        <input className={`${inputClass} h-8 flex-1`} maxLength={300} value={p.descricao ?? ""} onChange={(e) => setP((x) => ({ ...x, descricao: e.target.value || null }))} placeholder="Descrição curta" />
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await executarComToast(salvarPlano({ ...p, limite_usuarios: p.limite_usuarios === 0 ? 1 : p.limite_usuarios }), { sucesso: `Plano ${p.nome} salvo`, erro: "Erro ao salvar o plano" });
            })
          }
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
