"use client";

import { useMemo, useState } from "react";
import { PackageX, Search, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/Modal";
import { SubAbas } from "@/components/vendas/central/SubAbas";
import { formatBRL, formatarDataIso, hojeIsoLocal } from "@/lib/format";
import { FILTROS_CANCELAMENTO, SUBABAS_RETORNO, contarCancelamentos, contarSubabas, diasParaResponder, filtrarRetornos, ordenarRetornos, type QuemCancelou, type RetornoCentral, type SubabaRetorno } from "@/lib/retornos";
import type { DadosRetornos } from "@/lib/marketplace/retornos-servidor";

const POR_PAGINA = 30;

const TOM: Record<RetornoCentral["subaba"], "neutral" | "positive" | "negative"> = {
  em_analise: "neutral",
  em_devolucao: "neutral",
  aprovadas: "positive",
  em_disputa: "negative",
  canceladas: "neutral",
  pedidos_cancelados: "negative",
};

/** Falha de permissão da Shopee dita em português; qualquer outra aparece como veio. */
function explicarErro(erro: string): string {
  if (/permiss|permission|scope|forbidden|access|denied|auth/i.test(erro)) {
    return "O app da Shopee ainda não tem a permissão de Devoluções. Ative em Shopee Open Platform → seu app → Permissões e sincronize de novo.";
  }
  return erro;
}

function Cartao({ r, hoje }: { r: RetornoCentral; hoje: string }) {
  const dias = r.subaba === "em_analise" ? diasParaResponder(r.prazoResposta, hoje) : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-text-primary">{r.referencia}</span>
            <StatusChip label={r.origem === "shopee" ? "Shopee" : "Sistema"} tone="neutral" />
            <StatusChip label={r.statusRotulo} tone={TOM[r.subaba]} />
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {r.numeroPedido ? `Pedido ${r.numeroPedido}` : "Pedido não informado"}
            {r.loja ? ` · ${r.loja}` : ""}
            {r.comprador ? ` · ${r.comprador}` : ""}
            {r.criadoEm ? ` · ${formatarDataIso(r.criadoEm.slice(0, 10))}` : ""}
          </div>
        </div>
        <span className="font-mono text-sm text-negative shrink-0">{formatBRL(r.valor)}</span>
      </div>
      {r.motivo && <p className="text-sm text-text-primary mt-2">{r.motivo}</p>}
      {r.itens.length > 0 && (
        <p className="text-xs text-text-secondary mt-1">
          {r.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(" · ")}
        </p>
      )}
      {r.rastreio && <p className="text-xs text-text-tertiary mt-1">Rastreio da devolução: {r.rastreio}</p>}
      {dias !== null && (
        <p className={`text-xs mt-2 font-medium ${dias <= 1 ? "text-negative" : "text-text-secondary"}`}>
          {dias < 0 ? `Prazo de resposta vencido há ${-dias} ${dias === -1 ? "dia" : "dias"}` : dias === 0 ? "Responder hoje" : `Responder em ${dias} ${dias === 1 ? "dia" : "dias"}`}
        </p>
      )}
    </Card>
  );
}

/**
 * Aba Retornos e cancelados de Vendas: devoluções da Shopee, as registradas no sistema e os pedidos
 * cancelados (com quem cancelou), com as sub-abas do Seller Center. Em qual sub-aba cada uma cai vem
 * de `lib/retornos.ts`. `cancelados`: os pedidos cancelados da central (marketplace e do sistema).
 */
export function RetornosPainel({ dados, cancelados }: { dados: DadosRetornos; cancelados: RetornoCentral[] }) {
  const [subaba, setSubaba] = useState<SubabaRetorno>("todos");
  const [quem, setQuem] = useState<QuemCancelou | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const hoje = hojeIsoLocal();
  const lista = useMemo(() => ordenarRetornos([...dados.lista, ...cancelados]), [dados.lista, cancelados]);
  const contagem = useMemo(() => contarSubabas(lista), [lista]);
  const porQuem = useMemo(() => contarCancelamentos(lista), [lista]);
  const filtrados = useMemo(() => filtrarRetornos(lista, subaba, busca, quem), [lista, subaba, busca, quem]);

  return (
    <div className="space-y-3">
      {dados.erros.map((e) => (
        <div key={e.loja} role="status" className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>{e.loja}:</strong> não foi possível buscar as devoluções da Shopee. {explicarErro(e.erro)}
          </span>
        </div>
      ))}
      {!dados.disponivel && (
        <p className="text-xs text-text-secondary">As devoluções da Shopee precisam da migração 0090. Enquanto isso, só aparecem as registradas no sistema.</p>
      )}

      <SubAbas
        valor={subaba}
        onChange={(v) => (setSubaba(v), setQuem("todos"), setMostrar(POR_PAGINA))}
        itens={SUBABAS_RETORNO.map((s) => ({ id: s.id, rotulo: s.rotulo, n: contagem[s.id] }))}
      />

      {subaba === "pedidos_cancelados" && (
        <SubAbas
          valor={quem}
          onChange={(v) => (setQuem(v), setMostrar(POR_PAGINA))}
          itens={FILTROS_CANCELAMENTO.map((f) => ({ id: f.id, rotulo: f.rotulo, n: porQuem[f.id] }))}
        />
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
        <input
          type="search"
          className={`${inputClass} pl-9`}
          placeholder="Buscar por retorno, pedido, comprador, motivo ou produto"
          value={busca}
          onChange={(e) => (setBusca(e.target.value), setMostrar(POR_PAGINA))}
          aria-label="Buscar retornos"
        />
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={PackageX}
            title={lista.length === 0 ? "Nenhum retorno ou cancelamento ainda" : "Nada aqui"}
            description={
              lista.length === 0
                ? "Devoluções da Shopee, devoluções registradas no sistema e pedidos cancelados aparecem aqui. Use “Sincronizar pedidos” para buscar as da Shopee."
                : "Mude a sub-aba ou a busca."
            }
          />
        </Card>
      ) : (
        filtrados.slice(0, mostrar).map((r) => <Cartao key={r.id} r={r} hoje={hoje} />)
      )}
      {filtrados.length > mostrar && (
        <Button variant="secondary" className="w-full" onClick={() => setMostrar((m) => m + POR_PAGINA)}>
          Mostrar mais ({filtrados.length - mostrar} restantes)
        </Button>
      )}
    </div>
  );
}
