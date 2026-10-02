"use client";

import { Lock, MessageSquareText, Store } from "lucide-react";
import { TagPedido } from "./TagPedido";
import { Button } from "@/components/ui/Button";
import { RowMenu, type RowMenuAction } from "@/components/ui/RowMenu";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { formatBRL } from "@/lib/format";
import { LOGISTICAS, PROXIMA, ROTULO_ETAPA, ROTULO_MOTIVO, type PedidoCentral } from "@/lib/pedidos-central";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

const TOM_ETAPA: Record<PedidoCentral["etapa"], string> = {
  pagamento: "text-text-tertiary",
  reservar: "text-negative",
  retirada: "text-accent",
  emitir: "text-accent",
  imprimir: "text-accent",
  enviar: "text-accent",
  enviado: "text-text-primary",
  concluido: "text-positive",
  cancelado: "text-negative",
};

const ROTULO_PAGTO: Record<PedidoCentral["pagamento"], string> = { pago: "Pago", fiado: "Fiado", pendente: "A confirmar", cancelado: "Cancelado" };

/**
 * Um pedido na central: nº, produtos, valor com lucro (detalhe no hover), comprador,
 * datas, logística (travada quando é da plataforma), etapa com a ação seguinte e, no
 * canto, a loja e o canal com o ícone da marca.
 */
export function LinhaPedido({
  p,
  selecionado,
  onSelecionar,
  onAbrir,
  onAvancar,
  onVincular,
  onLogistica,
  acoes,
  processando,
  acaoExtra,
}: {
  /** Ação da plataforma (Programar envio, Imprimir etiqueta) no lugar da ação da etapa. */
  acaoExtra?: { rotulo: string; onClick: () => void; carregando: boolean };
  p: PedidoCentral;
  selecionado: boolean;
  onSelecionar: (v: boolean) => void;
  onAbrir: () => void;
  /** Ação da etapa (Aprovar, Marcar impresso...). */
  onAvancar: () => void;
  /** Anúncio de marketplace sem produto: abre o vínculo. */
  onVincular?: () => void;
  onLogistica: (l: string | null) => void;
  acoes: RowMenuAction[];
  processando: boolean;
}) {
  const proximaBase = p.editavel ? PROXIMA[p.etapa] : undefined;
  // Pedido do catálogo ainda não aprovado: a ação é sempre Aprovar (abre o fechamento).
  const proxima = proximaBase && p.chave.startsWith("catalogo:") ? { ...proximaBase, acao: "Aprovar" } : proximaBase;
  const nomeCanal = p.loja ? `${p.canal} · ${p.loja}` : p.canal;
  const cancelado = p.etapa === "cancelado";

  return (
    <div className={`rounded-lg border bg-surface-1 ${selecionado ? "border-accent" : "border-border"}`}>
      {/* Cabeçalho: nº e canal/loja */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-2/50 rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          {!p.chave.startsWith("catalogo:") && (
            <input type="checkbox" aria-label={`Selecionar ${p.numero}`} checked={selecionado} onChange={(e) => onSelecionar(e.target.checked)} />
          )}
          <button type="button" onClick={onAbrir} className="font-mono text-sm font-semibold text-accent hover:underline">
            #{p.numero}
          </button>
          {p.numeroExterno && p.numeroExterno !== p.numero && <span className="text-[11px] font-mono text-text-tertiary">pedido {p.numeroExterno}</span>}
          {p.etapa === "emitir" && <span className="text-[10px] rounded bg-surface-2 border border-border px-1.5 py-0.5 text-text-tertiary">NF-e não emitida</span>}
          {p.semCusto && <span className="text-[10px] rounded bg-negative-soft text-negative px-1.5 py-0.5">sem custo</span>}
          {p.tags.map((t) => (
            <TagPedido key={t} tag={t} />
          ))}
          {p.envio?.erro && p.etapa === "enviar" && (
            <span title={p.envio.erro} className="text-[11px] text-negative max-w-[18rem] truncate">
              Falha ao programar: {p.envio.erro}
            </span>
          )}
          {p.envio?.programado && !p.envio.erro && p.etapa === "enviar" && <span className="text-[11px] text-text-tertiary">Envio programado, esperando a Shopee</span>}
          {p.envio?.rastreio && <span className="text-[11px] font-mono text-text-secondary">Rastreio {p.envio.rastreio}</span>}
          {p.observacaoInterna && (
            <span title={p.observacaoInterna} className="inline-flex items-center gap-1 text-[11px] text-text-secondary max-w-[16rem] truncate">
              <MessageSquareText size={12} className="shrink-0 text-accent" /> {p.observacaoInterna}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary min-w-0">
          <span className="truncate max-w-[14rem]">{nomeCanal}</span>
          <IconeMarca nome={p.canal} tamanho={18} fallback={<OrigemIcone origem={p.origem} />} />
        </span>
      </div>

      {/* Corpo */}
      <div className="grid grid-cols-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_auto] gap-x-4 gap-y-3 px-3 py-3 text-sm items-start">
        <div className="col-span-2 md:col-span-1 min-w-0 space-y-1">
          {p.itens.slice(0, 3).map((i, n) => (
            <div key={n} className="min-w-0">
              <div className="truncate text-text-primary" title={i.nome}>
                {i.nome} <span className="text-text-tertiary">× {i.quantidade}</span>
              </div>
              {i.sku && <div className="text-[11px] font-mono text-text-tertiary truncate">{i.sku}</div>}
            </div>
          ))}
          {p.itens.length > 3 && <div className="text-[11px] text-text-tertiary">+ {p.itens.length - 3} item(ns)</div>}
        </div>

        <div>
          <ValorPedido p={p} />
          <div className="text-[11px] text-text-tertiary mt-0.5">{ROTULO_PAGTO[p.pagamento]}{p.formaPagamento ? ` · ${p.formaPagamento}` : ""}</div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-text-primary">{p.cliente ?? "—"}</div>
          {(p.cidade || p.uf) && <div className="text-[11px] text-text-tertiary truncate">{[p.cidade, p.uf].filter(Boolean).join(", ")}</div>}
        </div>

        <div className="text-[11px] text-text-secondary space-y-0.5">
          <div>
            <span className="text-text-tertiary">Pedido </span>
            {dataHora(p.data)}
          </div>
          {p.pagoEm && p.origem === "marketplace" && (
            <div>
              <span className="text-text-tertiary">Pago </span>
              {dataHora(p.pagoEm)}
            </div>
          )}
          {p.prazoEnvio && !cancelado && p.etapa !== "concluido" && p.etapa !== "enviado" && (
            <div className="text-negative">
              <span>Enviar até </span>
              {dataHora(p.prazoEnvio)}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {p.logisticaFixa ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-text-primary" title={p.logistica ?? "Definida pela plataforma"}>
              <Lock size={11} className="text-text-tertiary shrink-0" /> <span className="truncate">{p.logistica ?? "Envio da plataforma"}</span>
            </span>
          ) : p.chave.startsWith("venda:") && !cancelado ? (
            <select
              aria-label={`Logística do pedido ${p.numero}`}
              className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-xs"
              value={p.logistica ?? ""}
              onChange={(e) => onLogistica(e.target.value || null)}
            >
              <option value="">Sem logística</option>
              {LOGISTICAS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              {p.logistica && !(LOGISTICAS as readonly string[]).includes(p.logistica) && <option value={p.logistica}>{p.logistica}</option>}
            </select>
          ) : (
            <span className="text-xs text-text-tertiary">—</span>
          )}
        </div>

        <div className="col-span-2 md:col-span-1 flex md:flex-col items-center md:items-end justify-between gap-2">
          <span className={`text-xs font-medium whitespace-nowrap ${TOM_ETAPA[p.etapa]}`}>
            {ROTULO_ETAPA[p.etapa]}
            {p.motivoReserva ? ` · ${ROTULO_MOTIVO[p.motivoReserva]}` : ""}
          </span>
          <div className="flex items-center gap-1">
            {p.motivoReserva === "nao_mapeado" && p.origem === "marketplace" && onVincular && (
              <Button size="sm" variant="primary" onClick={onVincular}>
                Vincular anúncio
              </Button>
            )}
            {acaoExtra && (
              <Button size="sm" variant="primary" loading={acaoExtra.carregando} onClick={acaoExtra.onClick}>
                {acaoExtra.rotulo}
              </Button>
            )}
            {proxima && !acaoExtra && (
              <Button size="sm" variant={p.etapa === "emitir" ? "primary" : "secondary"} loading={processando} onClick={onAvancar}>
                {proxima.acao}
              </Button>
            )}
            {acoes.length > 0 && <RowMenu actions={acoes} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrigemIcone({ origem }: { origem: PedidoCentral["origem"] }) {
  return (
    <span className="inline-flex w-[18px] h-[18px] items-center justify-center rounded-md bg-accent-soft text-accent" title={origem === "pdv" ? "PDV" : "Catálogo"}>
      <Store size={11} />
    </span>
  );
}

/** Valor com lucro embaixo; passando o mouse (ou com foco), da venda até o lucro. */
function ValorPedido({ p }: { p: PedidoCentral }) {
  const cancelado = p.etapa === "cancelado";
  const confirmar = p.chave.startsWith("catalogo:");
  const outros = Math.max(0, Math.round((p.total - p.taxas - p.custo - p.lucro) * 100) / 100);
  const margem = p.total > 0 ? p.lucro / p.total : 0;
  return (
    <div className="relative group inline-block" tabIndex={0}>
      <div className={`font-mono ${cancelado ? "text-text-tertiary line-through" : "text-text-primary"}`}>{formatBRL(p.total)}</div>
      {!cancelado && !confirmar && (
        <>
          <div className={`text-[11px] font-medium ${p.lucro >= 0 ? "text-positive" : "text-negative"}`}>
            {formatBRL(p.lucro)} · {pct(margem)}
          </div>
          <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute left-0 top-full mt-1 z-30 w-60 rounded-md border border-border bg-surface-1 shadow-elev-2 p-3 text-xs">
            <Linha rotulo="Venda" valor={p.total} />
            {p.taxas > 0 && <Linha rotulo="Taxas da plataforma" valor={-p.taxas} />}
            <Linha rotulo="Custo dos produtos" valor={-p.custo} />
            {outros > 0 && <Linha rotulo="Imposto e outras deduções" valor={-outros} />}
            <div className="border-t border-border my-1.5" />
            <div className={`flex justify-between font-semibold ${p.lucro >= 0 ? "text-positive" : "text-negative"}`}>
              <span>Lucro ({pct(margem)})</span>
              <span className="font-mono">{formatBRL(p.lucro)}</span>
            </div>
            {p.semCusto && <p className="text-[11px] text-negative mt-1.5">Item sem produto vinculado: custo contado como zero.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3 text-text-secondary">
      <span>{rotulo}</span>
      <span className="font-mono">{formatBRL(valor)}</span>
    </div>
  );
}
