"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { PROVEDORES, type ProvedorId } from "@/lib/ia/provedores/catalogo";
import { AdicionarIAModal } from "@/components/configuracoes/AdicionarIAModal";
import { textoDoTeste, type EstadoTeste } from "@/lib/ia/teste";
import { definirIAPadrao, removerIA, usarIADoSistema } from "@/app/(painel)/configuracoes/ia-actions";

export interface IaCadastrada {
  id: string;
  provedor: ProvedorId;
  modelo: string;
  chave_final: string;
  padrao: boolean;
}

/**
 * Aba "IA": as IAs que a conta cadastrou (com a própria chave) e a IA do sistema.
 * A chave nunca chega aqui — só provedor, modelo e os 4 últimos caracteres.
 */
export function AbaIA({
  ias,
  cofreOk,
  iaSistemaOk,
  teste,
}: {
  ias: IaCadastrada[];
  /** `IA_CHAVE_COFRE` configurada no servidor; sem ela não dá para guardar chave. */
  cofreOk: boolean;
  iaSistemaOk: boolean;
  /** Estado do teste grátis da IA do sistema; `null` se a migração 0036 ainda não foi aplicada. */
  teste: EstadoTeste | null;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [adicionando, setAdicionando] = useState(false);
  const usandoPropria = ias.some((i) => i.padrao);

  function tornarPadrao(id: string) {
    startTransition(async () => {
      await executarComToast(definirIAPadrao(id), { sucesso: "IA padrão atualizada", erro: "Erro ao trocar a IA" });
    });
  }

  function voltarParaSistema() {
    startTransition(async () => {
      await executarComToast(usarIADoSistema(), { sucesso: "Usando a IA do sistema", erro: "Erro ao trocar a IA" });
    });
  }

  async function remover(ia: IaCadastrada) {
    const ok = await confirm({
      title: "Remover esta IA?",
      message: `${PROVEDORES[ia.provedor].nome} · ${ia.modelo} será apagada do sistema, junto com a chave guardada. A chave continua existindo no site do provedor.`,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerIA(ia.id), { sucesso: "IA removida", erro: "Erro ao remover a IA" });
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <CardTitle>Suas IAs</CardTitle>
            <p className="text-xs text-text-tertiary mt-0.5 max-w-2xl">
              Use a sua própria conta de IA (Google Gemini, OpenAI, Anthropic ou OpenRouter). Você paga direto ao provedor
              pelo que usar, sem a cota do sistema. A chave é guardada criptografada e só o servidor a lê.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAdicionando(true)} disabled={!cofreOk} className="shrink-0">
            <Plus size={14} />
            Adicionar IA
          </Button>
        </div>

        {!cofreOk && (
          <p className="text-xs text-negative border border-negative/30 bg-negative-soft rounded-md px-3 py-2 mt-3">
            O cofre de chaves ainda não está configurado neste sistema (falta a variável <code>IA_CHAVE_COFRE</code>). Avise o
            administrador — sem isso não dá para guardar chaves com segurança.
          </p>
        )}

        {ias.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={KeyRound}
              title="Nenhuma IA própria cadastrada"
              description="Sem ela, o sistema usa a IA do sistema, dentro do teste grátis."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border border border-border rounded-md">
            {ias.map((ia) => (
              <li key={ia.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{PROVEDORES[ia.provedor].nome}</span>
                    {ia.padrao && <StatusChip label="Em uso" tone="positive" />}
                  </div>
                  <div className="text-xs text-text-tertiary font-mono truncate">
                    {ia.modelo} · chave ••••{ia.chave_final}
                  </div>
                </div>
                <RowMenu
                  actions={[
                    ...(ia.padrao ? [] : [{ label: "Usar esta IA", onClick: () => tornarPadrao(ia.id) }]),
                    { label: "Remover", onClick: () => remover(ia), destructive: true },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-accent" />
          <CardTitle>IA do sistema</CardTitle>
          {!usandoPropria && iaSistemaOk && <StatusChip label="Em uso" tone="positive" />}
        </div>
        <p className="text-xs text-text-tertiary mb-3">
          {iaSistemaOk
            ? "É a IA que o Sertão oferece para você experimentar, com uso limitado. Para usar sem esse limite, cadastre a sua."
            : "A IA do sistema não está ativada neste momento. Cadastre a sua para usar os recursos de IA."}
        </p>
        {iaSistemaOk && teste && (
          <p
            className={`text-xs mb-3 rounded-md border px-3 py-2 ${
              teste.situacao === "encerrado" ? "border-negative/30 bg-negative-soft text-negative" : "border-border bg-surface-2 text-text-secondary"
            }`}
          >
            {textoDoTeste(teste)}
            {teste.situacao === "encerrado" && " Cadastre a sua IA acima para continuar usando os recursos de IA."}
          </p>
        )}
        {usandoPropria && iaSistemaOk && (
          <Button variant="secondary" onClick={voltarParaSistema} loading={pending}>
            Voltar a usar a IA do sistema
          </Button>
        )}
      </Card>

      <AdicionarIAModal key={adicionando ? "aberto" : "fechado"} open={adicionando} onClose={() => setAdicionando(false)} primeira={ias.length === 0} />
      {ConfirmDialog}
    </div>
  );
}
