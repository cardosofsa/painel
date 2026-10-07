"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
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
      <Card className="text-sm text-text-secondary">
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
    if (
      !(await confirm({
        title: "Desligar a NF-e?",
        message: "O token do emissor é apagado. A etapa Emitir passa a gerar só o comprovante do sistema.",
        confirmLabel: "Desligar",
      }))
    )
      return;
    startTransition(async () => {
      await executarComToast(desligarNfe(), { sucesso: "NF-e desligada", erro: "Erro ao desligar" });
    });
  }

  const campo = (k: keyof FiscalConfigTela, rotulo: string, dica?: string) => (
    <FormField label={rotulo} dica={dica}>
      <input className={inputClass} value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </FormField>
  );

  // Passo a passo da NF-e, com o que já está feito marcado.
  const passos: { feito: boolean; texto: string }[] = [
    { feito: f.ligada, texto: "Contrate o emissor (Focus NFe) e cadastre lá o certificado digital A1 da empresa." },
    { feito: f.ligada, texto: "Copie o token da API no painel do emissor e cole no campo ao lado." },
    { feito: !!f.inscricao_estadual?.trim(), texto: "Preencha a inscrição estadual e confira a tributação com o seu contador." },
    { feito: f.ligada && f.ambiente === "homologacao", texto: "Emita uma nota de teste em Homologação (não tem valor fiscal)." },
    { feito: f.ligada && f.ambiente === "producao", texto: "Deu certo? Troque o ambiente para Produção." },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <CardTitle className="mb-1">Etapa Emitir: o que gerar por padrão</CardTitle>
            <p className="text-sm text-text-secondary mb-4">
              Na hora de emitir você sempre pode trocar. &quot;Perguntar sempre&quot; abre a escolha sem nada marcado.
            </p>
            {(
              [
                ["padrao_pdv", "Vendas do PDV com entrega"],
                ["padrao_catalogo", "Pedidos do catálogo"],
              ] as const
            ).map(([k, rotulo]) => (
              <FormField key={k} label={rotulo}>
                <ChipRow>
                  {PADROES.map((p) => (
                    <Chip key={p.id} ativo={f[k] === p.id} onClick={() => setF((x) => ({ ...x, [k]: p.id }))}>
                      {p.rotulo}
                    </Chip>
                  ))}
                </ChipRow>
              </FormField>
            ))}
          </Card>

          <Card>
            <CardTitle className="mb-3">Como ligar a NF-e</CardTitle>
            <ol className="space-y-2.5">
              {passos.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {p.feito ? (
                    <CheckCircle2 size={16} className="text-positive shrink-0 mt-0.5" aria-label="Feito" />
                  ) : (
                    <Circle size={16} className="text-text-tertiary shrink-0 mt-0.5" aria-label="A fazer" />
                  )}
                  <span className={p.feito ? "text-text-secondary" : "text-text-primary"}>
                    <span className="font-mono text-xs text-text-tertiary mr-1">{i + 1}.</span>
                    {p.texto}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-text-tertiary mt-4">Sem NF-e ligada, a etapa Emitir gera o comprovante do sistema, que não substitui a nota fiscal.</p>
          </Card>
        </div>

        <Card>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3">
              <FileText size={20} className="text-accent mt-0.5" />
              <div>
                <CardTitle>NF-e pelo emissor (Focus NFe)</CardTitle>
                <p className="text-sm text-text-secondary">
                  Você contrata o emissor e cadastra lá o certificado A1. Aqui fica só o token da API. Confirme CFOP, CSOSN e PIS/COFINS com o seu contador.
                </p>
              </div>
            </div>
            <StatusChip tone={f.ligada ? "positive" : "neutral"} label={f.ligada ? "Ligada" : "Desligada"} />
          </div>
          {!cofreOk && <p className="text-sm text-negative mb-3">O cofre de chaves não está configurado neste servidor (IA_CHAVE_COFRE).</p>}
          <h3 className="text-sm font-medium text-text-primary mt-2 mb-3">Conexão com o emissor</h3>
          <FormField label={f.ligada ? "Trocar token (deixe vazio para manter)" : "Token da API do emissor"}>
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cole só aqui, nunca em conversas"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Ambiente">
              <select
                className={inputClass}
                value={f.ambiente}
                onChange={(e) => setF((x) => ({ ...x, ambiente: e.target.value as FiscalConfigTela["ambiente"] }))}
              >
                <option value="homologacao">Homologação (teste, sem valor fiscal)</option>
                <option value="producao">Produção</option>
              </select>
            </FormField>
            <FormField label="Série">
              <input
                className={inputClass}
                inputMode="numeric"
                value={f.serie}
                onChange={(e) => setF((x) => ({ ...x, serie: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
              />
            </FormField>
          </div>
          <h3 className="text-sm font-medium text-text-primary mt-2 mb-3 pt-4 border-t border-border">Tributação (confira com o contador)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Regime (CRT)">
              <select className={inputClass} value={f.crt} onChange={(e) => setF((x) => ({ ...x, crt: Number(e.target.value) as 1 | 2 | 3 }))}>
                <option value={1}>1 · Simples Nacional</option>
                <option value={2}>2 · Simples (excesso de sublimite)</option>
                <option value={3}>3 · Regime normal</option>
              </select>
            </FormField>
            {campo("inscricao_estadual", "Inscrição estadual")}
            {campo("cfop_padrao", "CFOP (dentro do estado)", "Ex.: 5102")}
            {campo("cfop_fora_estado", "CFOP (fora do estado)", "Ex.: 6102")}
            {campo("csosn_padrao", "CSOSN (ICMS)", "Ex.: 102 no Simples")}
            {campo("pis_cofins_cst", "CST PIS/COFINS", "Ex.: 07 ou 49")}
          </div>
          {campo("natureza", "Natureza da operação")}
          {f.ligada && (
            <Button variant="destructive" size="sm" onClick={desligar} disabled={pending}>
              Desligar NF-e
            </Button>
          )}
        </Card>
      </div>
      {/* Um "Salvar" só, fora dos cartões: ele grava os dois (antes ficava no segundo, e quem
          mexia só no primeiro não achava onde salvar). */}
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={salvar}>
          Salvar configurações fiscais
        </Button>
      </div>
      {ConfirmDialog}
    </div>
  );
}
