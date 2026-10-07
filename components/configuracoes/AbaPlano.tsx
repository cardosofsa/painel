"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { estourosNoPlano, percentualUso, rotuloLimite, situacaoAssinatura, type Plano, type ResumoAssinatura } from "@/lib/planos";
import { assinarPlano } from "@/app/(painel)/configuracoes/plano-actions";
import { IndiqueCard, type EstadoIndicacoes } from "@/components/configuracoes/IndiqueCard";

export interface DadosPlano {
  planos: Plano[];
  resumo: ResumoAssinatura;
  /** Indicação (0078) e a base do link pessoal (NEXT_PUBLIC_SITE_URL ou a origem atual). */
  indicacoes?: EstadoIndicacoes;
  siteUrl?: string;
}

/** Configurações → Plano (10.9): situação, uso e troca de plano. */
export function AbaPlano({ dados }: { dados: DadosPlano | null }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  if (!dados) {
    return (
      <Card className="text-sm text-text-secondary">
        Os planos precisam da migração <span className="font-mono">0057_planos_assinaturas.sql</span>. Aplique no Supabase e recarregue a página.
      </Card>
    );
  }
  const { planos, resumo } = dados;
  const efetivo = planos.find((p) => p.id === resumo.plano_efetivo) ?? null;
  const situacao = situacaoAssinatura(resumo, planos);
  const solicitado = resumo.plano_solicitado ? planos.find((p) => p.id === resumo.plano_solicitado) : null;

  async function assinar(p: Plano) {
    const estouros = estourosNoPlano(resumo.uso, p);
    if (estouros.length) {
      const ok = await confirm({
        title: `Trocar para o ${p.nome}?`,
        message: `Hoje você tem ${estouros.join(" e ")}. Nada é apagado, mas não dá para cadastrar mais até ficar dentro do limite.`,
        confirmLabel: "Trocar mesmo assim",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await executarComToast(assinarPlano(p.id, `${window.location.origin}/configuracoes`), { erro: "Erro ao solicitar o plano" });
      if (!r.ok) return;
      // Provedor de cobrança ligado: segue para o pagamento (URL externa do provedor).
      if (r.dado.checkout) window.location.href = r.dado.checkout;
      else toast.success(`Pedido do plano ${p.nome} enviado. A ativação é confirmada pelo administrador.`);
    });
  }

  const barras: { rotulo: string; usado: number; limite: number | null; unidade: string }[] = efetivo
    ? [
        { rotulo: "Produtos", usado: resumo.uso.produtos, limite: efetivo.limite_produtos, unidade: "produtos" },
        { rotulo: "Lojas conectadas (API)", usado: resumo.uso.lojas, limite: efetivo.limite_lojas, unidade: "lojas" },
        { rotulo: "Gerações de IA neste mês", usado: resumo.uso.ia_mes, limite: efetivo.limite_ia_mes, unidade: "gerações" },
        ...(resumo.uso.usuarios !== undefined ? [{ rotulo: "Usuários (você + operadores ativos)", usado: resumo.uso.usuarios, limite: efetivo.limite_usuarios, unidade: "usuários" }] : []),
        ...(resumo.uso.imagens_mes !== undefined && efetivo.limite_imagens_mes !== undefined ? [{ rotulo: "Imagens com IA neste mês", usado: resumo.uso.imagens_mes, limite: efetivo.limite_imagens_mes, unidade: "imagens" }] : []),
      ]
    : [];

  return (
    <div className="space-y-4 max-w-4xl">
      <Card>
        <div className="text-xs text-text-tertiary mb-1">Seu plano agora</div>
        <div className="text-xl font-semibold text-text-primary mb-1">{efetivo?.nome ?? resumo.plano_efetivo}</div>
        <p className={`text-sm mb-4 ${situacao.tom === "negative" ? "text-negative" : situacao.tom === "positive" ? "text-positive" : "text-text-secondary"}`}>{situacao.texto}</p>
        {solicitado && <p className="text-sm text-text-secondary mb-4">Pedido de troca para o {solicitado.nome} aguardando confirmação.</p>}
        <div className="space-y-3">
          {barras.map((b) => {
            const pct = percentualUso(b.usado, b.limite);
            return (
              <div key={b.rotulo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-text-secondary">{b.rotulo}</span>
                  <span className="font-mono text-text-primary">
                    {b.usado.toLocaleString("pt-BR")}
                    {b.limite !== null ? ` / ${b.limite.toLocaleString("pt-BR")}` : " · ilimitado"}
                  </span>
                </div>
                {pct !== null && (
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className={`h-full ${pct >= 90 ? "bg-negative" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {planos
          .filter((p) => p.ativo)
          .map((p) => {
            const atual = p.id === resumo.plano_efetivo && resumo.status !== "teste";
            return (
              <Card key={p.id} className={`p-5 flex flex-col ${p.id === resumo.plano_efetivo ? "border-accent" : ""}`}>
                <div className="font-semibold text-text-primary">{p.nome}</div>
                <div className="text-2xl font-mono font-semibold text-text-primary my-1">
                  {p.preco_mensal > 0 ? formatBRL(p.preco_mensal) : "Grátis"}
                  {p.preco_mensal > 0 && <span className="text-xs font-sans text-text-tertiary"> /mês</span>}
                </div>
                {p.descricao && <p className="text-xs text-text-secondary mb-3">{p.descricao}</p>}
                <ul className="space-y-1 text-sm text-text-secondary mb-4 flex-1">
                  {[rotuloLimite(p.limite_produtos, "produtos"), p.limite_lojas === 0 ? "Sem marketplace conectado" : rotuloLimite(p.limite_lojas, "lojas conectadas"), rotuloLimite(p.limite_usuarios, "usuários"), rotuloLimite(p.limite_ia_mes, "gerações de IA/mês"), ...(p.limite_imagens_mes !== undefined ? [rotuloLimite(p.limite_imagens_mes, "imagens com IA/mês")] : [])].map((t) => (
                    <li key={t} className="flex items-start gap-1.5">
                      <Check size={14} className="text-accent mt-0.5 shrink-0" /> {t}
                    </li>
                  ))}
                </ul>
                <Button variant={atual ? "secondary" : "primary"} disabled={atual || pending || resumo.plano_solicitado === p.id} loading={pending} onClick={() => assinar(p)}>
                  {atual ? "Plano atual" : resumo.plano_solicitado === p.id ? "Pedido enviado" : p.preco_mensal > 0 ? "Assinar" : "Mudar para este"}
                </Button>
              </Card>
            );
          })}
      </div>
      {dados.siteUrl && <IndiqueCard estado={dados.indicacoes ?? null} siteUrl={dados.siteUrl} />}
      {ConfirmDialog}
    </div>
  );
}
