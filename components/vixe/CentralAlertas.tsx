"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { ROTULO_CATEGORIA, type AcaoAlerta, type AlertaVixe, type CategoriaAlerta, type Gravidade } from "@/lib/vixe/alertas";
import { marcarAlertaLido } from "@/app/(painel)/alertas-actions";
import { atualizarPrecoProduto } from "@/app/(painel)/precificacao/actions";

const ESTILO_GRAVIDADE: Record<Gravidade, { faixa: string; rotulo: string; chip: string }> = {
  alta: { faixa: "bg-negative", rotulo: "Urgente", chip: "bg-negative-soft text-negative" },
  media: { faixa: "bg-accent", rotulo: "Atenção", chip: "bg-accent-soft text-accent" },
  baixa: { faixa: "bg-border-forte", rotulo: "Dica", chip: "bg-surface-2 text-text-secondary" },
};

/**
 * Central de alertas da Vixe: tudo o que pede ação, do mais urgente ao menos, com o botão
 * que resolve ao lado. Os dados chegam prontos do servidor (`carregarAlertasVixe`); aqui só
 * se filtra e se executa a ação.
 */
export function CentralAlertas({
  alertas,
  categorias,
  falhas,
}: {
  alertas: AlertaVixe[];
  categorias: CategoriaAlerta[];
  falhas: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [filtro, setFiltro] = useState<CategoriaAlerta | "todas">("todas");

  const contagem = useMemo(() => {
    const m = new Map<CategoriaAlerta, number>();
    for (const a of alertas) m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1);
    return m;
  }, [alertas]);
  const visiveis = filtro === "todas" ? alertas : alertas.filter((a) => a.categoria === filtro);
  const urgentes = alertas.filter((a) => a.gravidade === "alta").length;

  async function executarAcao(acao: AcaoAlerta) {
    if (acao.tipo === "marcar_lido") {
      startTransition(async () => {
        const r = await executarComToast(marcarAlertaLido(acao.alertaId), { sucesso: "Alerta ignorado", erro: "Erro ao ignorar o alerta" });
        if (r.ok) router.refresh();
      });
      return;
    }
    if (acao.tipo === "ajustar_preco") {
      const ok = await confirm({
        title: "Mudar o preço?",
        message: `O preço de venda de "${acao.produtoNome}" passa a ser ${formatBRL(acao.preco)}. Anúncios já publicados nas plataformas não mudam sozinhos.`,
        confirmLabel: "Mudar preço",
      });
      if (!ok) return;
      startTransition(async () => {
        const r = await executarComToast(atualizarPrecoProduto(acao.produtoId, acao.preco), { sucesso: "Preço atualizado", erro: "Erro ao mudar o preço" });
        if (r.ok) router.refresh();
      });
    }
  }

  function botao(acao: AcaoAlerta, principal: boolean) {
    const variant = principal ? "primary" : "secondary";
    // Botão que navega, não <a><button>: botão dentro de link é interativo aninhado, que o
    // leitor de tela anuncia duas vezes e o teclado foca duas vezes.
    if (acao.tipo === "link") {
      return (
        <Button key={acao.rotulo} variant={variant} onClick={() => router.push(acao.href)}>
          {acao.rotulo}
        </Button>
      );
    }
    if (acao.tipo === "externo") {
      return (
        <Button key={acao.rotulo} variant={variant} onClick={() => window.open(acao.href, "_blank", "noopener,noreferrer")}>
          {acao.rotulo} <ExternalLink size={13} />
        </Button>
      );
    }
    return (
      <Button key={acao.rotulo} variant={variant} disabled={pending} onClick={() => executarAcao(acao)}>
        {acao.rotulo}
      </Button>
    );
  }

  const chip = (valor: CategoriaAlerta | "todas", rotulo: string, n: number) => (
    <button
      key={valor}
      onClick={() => setFiltro(valor)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        filtro === valor ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:bg-surface-2"
      }`}
    >
      {rotulo} <span className="tabular">{n}</span>
    </button>
  );

  return (
    <>
      <div className="mb-5">
        <p className="text-sm text-text-secondary">
          {alertas.length === 0
            ? "Vixe, tudo em ordem por aqui. Nenhum alerta agora."
            : `Vixe! ${alertas.length} ${alertas.length === 1 ? "coisa pede" : "coisas pedem"} sua atenção${urgentes ? `, ${urgentes} ${urgentes === 1 ? "urgente" : "urgentes"}` : ""}.`}
        </p>
      </div>

      {falhas.length > 0 && (
        <p className="text-xs text-negative border border-negative/30 bg-negative-soft rounded-md px-3 py-2 mb-4">
          Não consegui ler: {falhas.join("; ")}. O resto da lista está certo.
        </p>
      )}

      {categorias.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {chip("todas", "Todos", alertas.length)}
          {categorias.map((c) => chip(c, ROTULO_CATEGORIA[c], contagem.get(c) ?? 0))}
        </div>
      )}

      {visiveis.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-8 gap-2">
            <CircleCheck size={28} className="text-positive" />
            <p className="text-sm font-medium text-text-primary">Nada pendente{filtro !== "todas" ? ` em ${ROTULO_CATEGORIA[filtro]}` : ""}</p>
            <p className="text-xs text-text-tertiary max-w-sm">
              A Vixe olha estoque, custos, contas vencidas, crediário e preços. Quando algo precisar de você, aparece aqui.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((a) => {
            const estilo = ESTILO_GRAVIDADE[a.gravidade];
            return (
              <li key={a.id} className="relative bg-surface-1 border border-border rounded-lg overflow-hidden">
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${estilo.faixa}`} aria-hidden="true" />
                <div className="pl-4 pr-3 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${estilo.chip}`}>{estilo.rotulo}</span>
                    <span className="text-xs text-text-tertiary">{ROTULO_CATEGORIA[a.categoria]}</span>
                  </div>
                  <div className="text-sm font-medium text-text-primary">{a.titulo}</div>
                  <p className="text-sm text-text-secondary mt-0.5">{a.detalhe}</p>
                  {a.acoes.length > 0 && <div className="flex flex-wrap gap-2 mt-2.5">{a.acoes.map((acao, i) => botao(acao, i === 0))}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {ConfirmDialog}
    </>
  );
}
