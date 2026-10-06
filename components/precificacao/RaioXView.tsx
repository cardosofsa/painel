"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Download, Lightbulb, ScanSearch } from "lucide-react";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { campoBase } from "@/components/ui/Modal";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { montarItensRaioX, perdaMensal, ROTULO_FONTE, ROTULO_SELO, type FontePreco, type ItemRaioX, type SeloRaioX } from "@/lib/raio-x";
import { tabelaRaioX } from "@/lib/precificacao-exportar";
import type { LojaOpcao, PrecificacaoHist, ProdutoOpcao } from "@/lib/precificacao-tipos";
import { carregarRaioX, salvarPrecoPraticado, type DadosRaioX } from "@/app/(painel)/precificacao/actions";

const TOM_SELO: Record<SeloRaioX, string> = {
  saudavel: "bg-positive-soft text-positive",
  apertada: "bg-accent-soft text-accent",
  prejuizo: "bg-negative-soft text-negative",
  caro: "bg-surface-2 text-text-secondary",
  zona_morta: "bg-negative-soft text-negative",
  sem_preco: "bg-surface-2 text-text-tertiary",
};

type Filtro = "todos" | SeloRaioX;

/**
 * Raio-X (Fase 1): o preço que você usa em cada anúncio contra o preço ideal da sua regra.
 * Quanto ganha ou perde por venda e por mês, nota, situação e dicas. Os dados chegam
 * quando a aba abre; a conta é toda em `lib/raio-x.ts`.
 */
export function RaioXView({ lojas, produtos, onAbrir, empresa }: { lojas: LojaOpcao[]; produtos: ProdutoOpcao[]; onAbrir: (h: PrecificacaoHist) => void; empresa?: { nome: string | null; logoUrl?: string | null } | null }) {
  const [dados, setDados] = useState<DadosRaioX | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [preferida, setPreferida] = useState<Record<string, FontePreco>>({});
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    executar(carregarRaioX())
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Erro ao carregar o Raio-X"));
    return () => {
      vivo = false;
    };
  }, []);

  const custoAtual = useMemo(() => new Map(produtos.map((p) => [p.id, Number(p.custo)])), [produtos]);
  const itens = useMemo(
    () => (dados ? montarItensRaioX(dados.precificacoes, lojas, custoAtual, dados, preferida) : []),
    [dados, lojas, custoAtual, preferida],
  );

  if (erro) return <Card><p className="text-sm text-negative">{erro}</p></Card>;
  if (!dados) return <Card><p className="text-sm text-text-secondary">Carregando o Raio-X…</p></Card>;
  if (itens.length === 0)
    return (
      <Card>
        <EmptyState icon={ScanSearch} title="Nenhuma precificação salva ainda" description="Salve a precificação de um anúncio na aba Individual. Aqui ela aparece comparada com o preço que você usa de verdade." />
      </Card>
    );

  const contagem = (s: SeloRaioX) => itens.filter((i) => i.resultado.selo === s).length;
  const lista = filtro === "todos" ? itens : itens.filter((i) => i.resultado.selo === filtro);
  const naMesa = itens.reduce((t, i) => t + Math.max(0, perdaMensal(i.resultado)), 0);
  const comNota = itens.filter((i) => i.resultado.nota !== null);
  const notaMedia = comNota.length ? Math.round(comNota.reduce((t, i) => t + (i.resultado.nota ?? 0), 0) / comNota.length) : null;
  const filtros: Filtro[] = ["todos", "prejuizo", "zona_morta", "apertada", "caro", "saudavel", "sem_preco"];

  function atualizar(chave: string, novo: number) {
    setDados((d) => (d ? { ...d, digitados: { ...d.digitados, [chave]: { preco: novo, observado_em: new Date().toISOString() } } } : d));
    setPreferida((p) => ({ ...p, [chave]: "digitado" }));
  }

  return (
    <div className="space-y-4">
      {!dados.migracaoOk && <p className="text-xs text-text-tertiary">Preço digitado, preço do anúncio no ar e vendas do mês aparecem depois da migração 0071. Por enquanto, só o preço ideal.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardEyebrow>Dinheiro na mesa</CardEyebrow>
          <div className={`mt-1 text-xl font-semibold font-mono ${naMesa > 0 ? "text-negative" : "text-text-primary"}`}>{formatBRL(naMesa)}</div>
          <p className="text-xs text-text-tertiary mt-0.5">por mês, abaixo do ideal</p>
        </Card>
        <Card>
          <CardEyebrow>Nota média</CardEyebrow>
          <div className="mt-1 text-xl font-semibold font-mono text-text-primary">{notaMedia ?? "—"}</div>
          <p className="text-xs text-text-tertiary mt-0.5">de 0 a 100</p>
        </Card>
        <Card>
          <CardEyebrow>No prejuízo</CardEyebrow>
          <div className={`mt-1 text-xl font-semibold font-mono ${contagem("prejuizo") ? "text-negative" : "text-text-primary"}`}>{contagem("prejuizo")}</div>
          <p className="text-xs text-text-tertiary mt-0.5">anúncios</p>
        </Card>
        <Card>
          <CardEyebrow>Na zona morta</CardEyebrow>
          <div className={`mt-1 text-xl font-semibold font-mono ${contagem("zona_morta") ? "text-negative" : "text-text-primary"}`}>{contagem("zona_morta")}</div>
          <p className="text-xs text-text-tertiary mt-0.5">recebem menos cobrando mais</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipRow>
          {filtros.map((f) => (
            <Chip key={f} ativo={filtro === f} onClick={() => setFiltro(f)}>
              {f === "todos" ? "Todos" : ROTULO_SELO[f]}
              <span className="ml-1.5 font-mono text-xs opacity-80">{f === "todos" ? itens.length : contagem(f)}</span>
            </Chip>
          ))}
        </ChipRow>
        <Button variant="secondary" size="sm" onClick={() => setExportando(true)}>
          <Download size={14} /> Exportar
        </Button>
      </div>

      <Card padding="nenhum" className="overflow-hidden">
        <ul className="divide-y divide-border">
          {lista.map((i) => (
            <LinhaRaioX key={i.chave} item={i} aberto={aberto === i.chave} onAlternar={() => setAberto(aberto === i.chave ? null : i.chave)} onFonte={(f) => setPreferida((p) => ({ ...p, [i.chave]: f }))} onSalvo={(v) => atualizar(i.chave, v)} onAbrir={() => onAbrir(i.precificacao as PrecificacaoHist)} habilitado={dados.migracaoOk} />
          ))}
        </ul>
      </Card>

      {exportando && (
        <ExportarModal
          aberto
          onClose={() => setExportando(false)}
          titulo="Exportar Raio-X"
          escopos={[
            { id: "lista", rotulo: "Desta lista", quantidade: lista.length },
            { id: "todos", rotulo: "Todos os anúncios", quantidade: itens.length },
          ]}
          montar={(id) => tabelaRaioX(id === "todos" ? itens : lista, `${id === "todos" ? itens.length : lista.length} anúncios`)}
          empresa={empresa}
        />
      )}
    </div>
  );
}

function LinhaRaioX({
  item: i,
  aberto,
  onAlternar,
  onFonte,
  onSalvo,
  onAbrir,
  habilitado,
}: {
  item: ItemRaioX;
  aberto: boolean;
  onAlternar: () => void;
  onFonte: (f: FontePreco) => void;
  onSalvo: (preco: number) => void;
  onAbrir: () => void;
  habilitado: boolean;
}) {
  const r = i.resultado;
  const [preco, setPreco] = useState(i.precos.digitado ? String(i.precos.digitado).replace(".", ",") : "");
  const [pending, startTransition] = useTransition();
  const fonteAtual = r.praticado ? (Object.entries(i.precos).find(([, v]) => v === r.praticado!.precoVenda)?.[0] as FontePreco | undefined) : undefined;

  function salvar() {
    const v = numeroOuNulo(preco.replace(",", "."));
    if (v === null || v <= 0) return;
    startTransition(async () => {
      const res = await executarComToast(
        salvarPrecoPraticado({ chave: i.chave, produto_id: i.precificacao.produto_id, loja_id: i.precificacao.loja_id, preco: v }),
        { sucesso: "Preço guardado.", erro: "Erro ao guardar o preço" },
      );
      if (res.ok) onSalvo(v);
    });
  }

  return (
    <li>
      <button type="button" onClick={onAlternar} aria-expanded={aberto} className="w-full px-4 py-3 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_7rem_3.5rem_auto] gap-x-4 gap-y-1 items-center text-left hover:bg-surface-2">
        <div className="min-w-0">
          <div className="font-medium text-text-primary truncate">{i.rotulo}</div>
          <div className="text-xs text-text-tertiary truncate">{i.loja}</div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-xs text-text-tertiary">Praticado</div>
          <div className="font-mono text-sm text-text-primary">{r.praticado ? formatBRL(r.praticado.precoVenda) : "—"}</div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-xs text-text-tertiary">Ideal</div>
          <div className="font-mono text-sm text-text-primary">{r.ideal.viavel ? formatBRL(r.ideal.precoVenda) : "—"}</div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-xs text-text-tertiary">{r.diferencaMes !== null ? "No mês" : "Por venda"}</div>
          <div className={`font-mono text-sm ${r.diferencaPorVenda === null ? "text-text-tertiary" : (r.diferencaMes ?? r.diferencaPorVenda) < 0 ? "text-negative" : "text-positive"}`}>
            {r.diferencaMes !== null ? formatBRL(r.diferencaMes) : r.diferencaPorVenda !== null ? formatBRL(r.diferencaPorVenda) : "—"}
          </div>
        </div>
        <div className="hidden sm:block text-right font-mono text-lg font-semibold text-text-primary" title="Nota de 0 a 100">
          {r.nota ?? "—"}
        </div>
        <div className="flex items-center gap-2 justify-end">
          <span className={`text-xs font-medium rounded px-1.5 py-0.5 whitespace-nowrap ${TOM_SELO[r.selo]}`}>{ROTULO_SELO[r.selo]}</span>
          <ChevronDown size={16} className={`text-text-tertiary transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <Numero rotulo="Preço ideal" valor={r.ideal.viavel ? formatBRL(r.ideal.precoVenda) : "—"} />
              <Numero rotulo="Preço mínimo" valor={r.precoMinimo ? formatBRL(r.precoMinimo) : "—"} dica="Abaixo disso, prejuízo" />
              <Numero rotulo="Lucro por venda" valor={r.praticado ? formatBRL(r.praticado.lucroLiquido) : "—"} />
              <Numero rotulo="Margem" valor={r.praticado ? `${(r.praticado.margemEfetivaPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"} />
              <Numero rotulo="Por venda" valor={r.diferencaPorVenda !== null ? formatBRL(r.diferencaPorVenda) : "—"} dica="vs. o ideal" />
              <Numero rotulo="Nota" valor={r.nota !== null ? String(r.nota) : "—"} />
            </div>
            {Object.keys(i.precos).length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-tertiary mb-1.5">Preço praticado: de onde vem</div>
                <ChipRow>
                  {(Object.entries(i.precos) as [FontePreco, number][]).map(([f, v]) => (
                    <Chip key={f} ativo={fonteAtual === f} onClick={() => onFonte(f)} titulo={ROTULO_FONTE[f]}>
                      {ROTULO_FONTE[f]}: <span className="font-mono ml-1">{formatBRL(v)}</span>
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Preço que uso hoje (R$)</span>
                <input className={`${campoBase} w-32`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" disabled={!habilitado} />
              </label>
              <Button size="sm" variant="primary" onClick={salvar} loading={pending} disabled={!habilitado || !preco.trim()}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={onAbrir}>
                Abrir na calculadora
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <CardTitle className="flex items-center gap-2 text-sm mb-2">
              <Lightbulb size={15} className="text-accent" aria-hidden /> Dicas
            </CardTitle>
            {r.dicas.length ? (
              <ul className="space-y-1.5 text-sm text-text-secondary list-disc pl-5">
                {r.dicas.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">Preço dentro da sua regra. Nada a mexer por enquanto.</p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Numero({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-3 py-2">
      <div className="text-xs text-text-tertiary">{rotulo}</div>
      <div className="font-mono text-text-primary">{valor}</div>
      {dica && <div className="text-xs text-text-tertiary">{dica}</div>}
    </div>
  );
}
