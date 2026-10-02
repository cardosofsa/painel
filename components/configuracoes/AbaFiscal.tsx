"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { desligarNfe, salvarFiscal } from "@/app/(painel)/configuracoes/fiscal-actions";

type Padrao = "comprovante" | "nfe" | "perguntar";

export interface FiscalConfigTela {
  ligada: boolean;
  ambiente: "homologacao" | "producao";
  serie: number;
  inscricao_estadual: string | null;
  crt: 1 | 2 | 3;
  cfop_padrao: string;
  cfop_fora_estado: string;
  csosn_padrao: string;
  pis_cofins_cst: string;
  natureza: string;
  padrao_pdv: Padrao;
  padrao_catalogo: Padrao;
}

export const FISCAL_PADRAO: FiscalConfigTela = {
  ligada: false,
  ambiente: "homologacao",
  serie: 1,
  inscricao_estadual: null,
  crt: 1,
  cfop_padrao: "5102",
  cfop_fora_estado: "6102",
  csosn_padrao: "102",
  pis_cofins_cst: "07",
  natureza: "Venda de mercadoria",
  padrao_pdv: "comprovante",
  padrao_catalogo: "perguntar",
};

const PADROES: { id: Padrao; rotulo: string }[] = [
  { id: "comprovante", rotulo: "Comprovante do sistema" },
  { id: "nfe", rotulo: "NF-e" },
  { id: "perguntar", rotulo: "Perguntar sempre" },
];

/**
 * Configurações → Fiscal (11.7): o que a etapa Emitir faz por padrão e a NF-e pelo emissor
 * (Focus NFe). Sem token, a NF-e fica desligada e o padrão vira comprovante.
 */
export function AbaFiscal({ fiscal, cofreOk }: { fiscal: FiscalConfigTela | null; cofreOk: boolean }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [f, setF] = useState<FiscalConfigTela>(fiscal ?? FISCAL_PADRAO);
  const [token, setToken] = useState("");

  if (fiscal === null) {
    return (
      <Card className="p-5 text-sm text-text-secondary">
        O fiscal precisa da migração <span className="font-mono">0062_fiscal_nfe.sql</span>. Aplique no Supabase e recarregue a página.
      </Card>
    );
  }

  function salvar() {
    const { ligada: _l, ...resto } = f;
    void _l;
    startTransition(async () => {
      const r = await executarComToast(salvarFiscal({ ...resto, token: token.trim() || undefined }), { sucesso: "Fiscal salvo", erro: "Erro ao salvar" });
      if (r.ok) setToken("");
    });
  }

  async function desligar() {
    if (!(await confirm({ title: "Desligar a NF-e?", message: "O token do emissor é apagado. A etapa Emitir passa a gerar só o comprovante do sistema.", confirmLabel: "Desligar" }))) return;
    startTransition(async () => {
      await executarComToast(desligarNfe(), { sucesso: "NF-e desligada", erro: "Erro ao desligar" });
    });
  }

  const campo = (k: keyof FiscalConfigTela, rotulo: string, dica?: string) => (
    <FormField label={rotulo} dica={dica}>
      <input className={inputClass} value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </FormField>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-5">
        <h3 className="font-medium text-text-primary mb-1">Etapa Emitir: o que gerar por padrão</h3>
        <p className="text-sm text-text-secondary mb-4">Na hora de emitir você sempre pode trocar. &quot;Perguntar sempre&quot; abre a escolha sem nada marcado.</p>
        {(
          [
            ["padrao_pdv", "Vendas do PDV com entrega"],
            ["padrao_catalogo", "Pedidos do catálogo"],
          ] as const
        ).map(([k, rotulo]) => (
          <FormField key={k} label={rotulo}>
            <div className="flex flex-wrap gap-2">
              {PADROES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={f[k] === p.id}
                  onClick={() => setF((x) => ({ ...x, [k]: p.id }))}
                  className={`text-sm rounded-md border px-3 py-1.5 ${f[k] === p.id ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
          </FormField>
        ))}
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <FileText size={20} className="text-accent mt-0.5" />
            <div>
              <h3 className="font-medium text-text-primary">NF-e pelo emissor (Focus NFe)</h3>
              <p className="text-sm text-text-secondary">
                Você contrata o emissor e cadastra lá o certificado A1. Aqui fica só o token da API. Confirme CFOP, CSOSN e PIS/COFINS com o seu contador.
              </p>
            </div>
          </div>
          <StatusChip tone={f.ligada ? "positive" : "neutral"} label={f.ligada ? "Ligada" : "Desligada"} />
        </div>
        {!cofreOk && <p className="text-sm text-negative mb-3">O cofre de chaves não está configurado neste servidor (IA_CHAVE_COFRE).</p>}
        <FormField label={f.ligada ? "Trocar token (deixe vazio para manter)" : "Token da API do emissor"}>
          <input className={inputClass} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole só aqui, nunca em conversas" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ambiente">
            <select className={inputClass} value={f.ambiente} onChange={(e) => setF((x) => ({ ...x, ambiente: e.target.value as FiscalConfigTela["ambiente"] }))}>
              <option value="homologacao">Homologação (teste, sem valor fiscal)</option>
              <option value="producao">Produção</option>
            </select>
          </FormField>
          <FormField label="Regime (CRT)">
            <select className={inputClass} value={f.crt} onChange={(e) => setF((x) => ({ ...x, crt: Number(e.target.value) as 1 | 2 | 3 }))}>
              <option value={1}>1 · Simples Nacional</option>
              <option value={2}>2 · Simples (excesso de sublimite)</option>
              <option value={3}>3 · Regime normal</option>
            </select>
          </FormField>
          {campo("inscricao_estadual", "Inscrição estadual")}
          <FormField label="Série">
            <input className={inputClass} inputMode="numeric" value={f.serie} onChange={(e) => setF((x) => ({ ...x, serie: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))} />
          </FormField>
          {campo("cfop_padrao", "CFOP (dentro do estado)", "Ex.: 5102")}
          {campo("cfop_fora_estado", "CFOP (fora do estado)", "Ex.: 6102")}
          {campo("csosn_padrao", "CSOSN (ICMS)", "Ex.: 102 no Simples")}
          {campo("pis_cofins_cst", "CST PIS/COFINS", "Ex.: 07 ou 49")}
        </div>
        {campo("natureza", "Natureza da operação")}
        <div className="flex justify-between gap-2">
          {f.ligada ? (
            <Button variant="ghost" onClick={desligar} disabled={pending}>
              Desligar NF-e
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" loading={pending} onClick={salvar}>
            Salvar
          </Button>
        </div>
      </Card>
      {ConfirmDialog}
    </div>
  );
}
