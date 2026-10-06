"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCheck, ScanBarcode, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { acharProduto, itensParaAplicar, lerBipe, montarLinhas, resumoInventario, type ProdutoInventario } from "@/lib/inventario";
import { aplicarInventario } from "./actions";

export interface ProdutoContagem {
  id: string;
  nome: string;
  sku: string;
  codigo_barras: string | null;
  custo: number;
  estoque: number;
  armazem_id: string | null;
}

export interface HistoricoInventario {
  id: string;
  armazem_id: string | null;
  observacao: string | null;
  itens: number;
  ajustes: number;
  criado_em: string;
}

type Filtro = "todos" | "contados" | "diferenca" | "faltando";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "contados", rotulo: "Contados" },
  { id: "diferenca", rotulo: "Com diferença" },
  { id: "faltando", rotulo: "Não contados" },
];

const chaveRascunho = (armazem: string) => `inventario:rascunho:${armazem || "geral"}`;

function lerRascunho(armazem: string): Record<string, number> {
  try {
    const bruto = window.localStorage.getItem(chaveRascunho(armazem));
    const obj = bruto ? (JSON.parse(bruto) as unknown) : null;
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0),
    );
  } catch {
    return {};
  }
}

function gravarRascunho(armazem: string, contagem: Record<string, number>) {
  try {
    if (Object.keys(contagem).length) window.localStorage.setItem(chaveRascunho(armazem), JSON.stringify(contagem));
    else window.localStorage.removeItem(chaveRascunho(armazem));
  } catch {
    // Sem armazenamento (aba anônima): a contagem só não sobrevive ao recarregar.
  }
}

/**
 * Inventário (0074): bipa ou digita a contagem, vê as diferenças contra o saldo e aplica.
 * A contagem fica salva no navegador até aplicar, para não perder se a página recarregar.
 */
export function InventarioClient({
  produtos,
  armazens,
  saldos,
  historico,
  migracaoOk,
}: {
  produtos: ProdutoContagem[];
  armazens: { id: string; nome: string }[];
  saldos: { produto_id: string; armazem_id: string; quantidade: number }[];
  historico: HistoricoInventario[];
  migracaoOk: boolean;
}) {
  const [armazem, setArmazem] = useState("");
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [bipe, setBipe] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [observacao, setObservacao] = useState("");
  const [ultimo, setUltimo] = useState<{ id: string; nome: string; total: number } | null>(null);
  const [aplicando, startAplicar] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const campoBipe = useRef<HTMLInputElement>(null);

  // O rascunho mora no localStorage, que só existe no navegador: lê depois de montar.
  useEffect(() => {
    const salvo = lerRascunho(armazem);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com armazenamento externo
    setContagem(salvo);
  }, [armazem]);

  /** Toda mudança da contagem passa por aqui e já vai para o rascunho do armazém atual. */
  function mudarContagem(fn: (c: Record<string, number>) => Record<string, number>) {
    setContagem((c) => {
      const n = fn(c);
      gravarRascunho(armazem, n);
      return n;
    });
  }

  const base: ProdutoInventario[] = useMemo(() => {
    const saldo = new Map<string, number>();
    if (armazem) for (const s of saldos) if (s.armazem_id === armazem) saldo.set(s.produto_id, s.quantidade);
    return produtos.map((p) => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      codigo_barras: p.codigo_barras,
      custo: p.custo,
      esperado: armazem ? (saldo.get(p.id) ?? 0) : p.estoque,
    }));
  }, [produtos, saldos, armazem]);

  const linhas = useMemo(() => montarLinhas(base, contagem), [base, contagem]);
  const resumo = useMemo(() => resumoInventario(linhas), [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter((l) => {
        if (filtro === "contados" && l.contado === null) return false;
        if (filtro === "diferenca" && !l.diferenca) return false;
        if (filtro === "faltando" && l.contado !== null) return false;
        if (!termo) return true;
        return l.produto.nome.toLowerCase().includes(termo) || l.produto.sku.toLowerCase().includes(termo) || (l.produto.codigo_barras ?? "").includes(termo);
      })
      .sort((a, b) => Math.abs(b.diferenca ?? 0) - Math.abs(a.diferenca ?? 0));
  }, [linhas, filtro, busca]);

  function definir(id: string, valor: number | null) {
    mudarContagem((c) => {
      const n = { ...c };
      if (valor === null) delete n[id];
      else n[id] = valor;
      return n;
    });
  }

  function aoBipar(e: React.FormEvent) {
    e.preventDefault();
    const lido = lerBipe(bipe);
    if (!lido) return;
    const p = acharProduto(base, lido.termo);
    if (!p) {
      toast.error(`Nenhum produto com o código ou SKU "${lido.termo}".`);
      setBipe("");
      return;
    }
    const total = (contagem[p.id] ?? 0) + lido.quantidade;
    definir(p.id, total);
    setUltimo({ id: p.id, nome: p.nome, total });
    setBipe("");
    campoBipe.current?.focus();
  }

  async function aplicar() {
    const itens = itensParaAplicar(contagem);
    if (!itens.length) return;
    const nomeArmazem = armazens.find((a) => a.id === armazem)?.nome;
    const ok = await confirm({
      title: "Aplicar o inventário?",
      message: `${itens.length} produto(s) contado(s)${nomeArmazem ? ` em ${nomeArmazem}` : ""}. ${resumo.sobras} com sobra (+${resumo.unidadesSobra} un.) e ${resumo.faltas} com falta (−${resumo.unidadesFalta} un.). O estoque passa a ser o que você contou. Produtos não contados ficam como estão.`,
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    startAplicar(async () => {
      const r = await executarComToast(aplicarInventario({ armazemId: armazem || null, itens, observacao: observacao.trim() || null }), {
        sucesso: "Inventário aplicado. O estoque foi ajustado.",
        erro: "Erro ao aplicar o inventário",
      });
      if (!r.ok) return;
      mudarContagem(() => ({}));
      setObservacao("");
      setUltimo(null);
    });
  }

  async function limpar() {
    const ok = await confirm({
      title: "Limpar a contagem?",
      message: "Tudo o que foi contado nesta tela será apagado. O estoque não muda.",
      confirmLabel: "Limpar",
    });
    if (ok) {
      mudarContagem(() => ({}));
      setUltimo(null);
    }
  }

  const nomeArmazem = (id: string | null) => (id ? (armazens.find((a) => a.id === id)?.nome ?? "Armazém removido") : "Estoque geral");

  return (
    <>
      <PageHeader
        title="Inventário"
        descricao="Conte o estoque, veja as diferenças e ajuste tudo de uma vez."
        actions={
          <Link href="/estoque" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ArrowLeft size={15} aria-hidden /> Voltar ao estoque
          </Link>
        }
      />

      {!migracaoOk && (
        <p className="text-sm text-text-secondary border border-border bg-surface-2 rounded-md px-3 py-2 mb-4">
          Para aplicar o inventário, aplique a migração <span className="font-mono">0074_inventario.sql</span> no Supabase. Dá para ir contando: a contagem fica
          guardada neste navegador.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 mb-5">
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="block text-xs text-text-secondary mb-1">Onde você está contando</span>
              <select className={inputClass} value={armazem} onChange={(e) => setArmazem(e.target.value)} disabled={aplicando}>
                <option value="">Estoque geral (total do produto)</option>
                {armazens.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={aoBipar} className="block">
              <label htmlFor="bipe" className="block text-xs text-text-secondary mb-1">
                Bipe o código de barras ou digite o SKU
              </label>
              <div className="relative">
                <ScanBarcode size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
                <input
                  id="bipe"
                  ref={campoBipe}
                  className={`${inputClass} pl-8`}
                  value={bipe}
                  onChange={(e) => setBipe(e.target.value)}
                  placeholder="Ex.: 7891234567890 ou 6*CAN-1"
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </form>
          </div>
          <p className="text-xs text-text-tertiary" aria-live="polite">
            {ultimo ? (
              <>
                Último: <span className="text-text-primary font-medium">{ultimo.nome}</span> → {ultimo.total} un.
              </>
            ) : (
              "Cada bipe soma 1. Para uma caixa fechada, digite a quantidade e * antes do código (ex.: 12*789…)."
            )}
          </p>
        </Card>

        <Card>
          <CardEyebrow>Contagem</CardEyebrow>
          <HeroMetric
            value={`${resumo.contados} de ${linhas.length}`}
            caption={resumo.contados ? `${resumo.iguais} sem diferença` : "nenhum produto contado ainda"}
          />
          {resumo.contados > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-text-tertiary">Sobra</dt>
                <dd className={`font-mono ${resumo.unidadesSobra ? "text-positive" : "text-text-secondary"}`}>
                  +{resumo.unidadesSobra} un. · {formatBRL(resumo.valorSobra)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Falta</dt>
                <dd className={`font-mono ${resumo.unidadesFalta ? "text-negative" : "text-text-secondary"}`}>
                  −{resumo.unidadesFalta} un. · {formatBRL(resumo.valorFalta)}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ChipRow className="w-full sm:w-auto sm:flex-1">
          {FILTROS.map((f) => (
            <Chip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.rotulo}
              {f.id === "contados" && resumo.contados ? ` (${resumo.contados})` : ""}
              {f.id === "diferenca" && resumo.sobras + resumo.faltas ? ` (${resumo.sobras + resumo.faltas})` : ""}
            </Chip>
          ))}
        </ChipRow>
        <input
          className={`${inputClass} sm:max-w-56`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por nome ou SKU"
          aria-label="Filtrar produtos"
        />
      </div>

      {produtos.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhum produto para contar"
          description="Cadastre produtos ativos para fazer o inventário. Kits ficam de fora: conte os componentes."
        />
      ) : (
        <Card className="p-0 overflow-hidden mb-4">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-text-secondary">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Produto</th>
                  <th className="text-right font-medium px-2 sm:px-3 py-2">Sistema</th>
                  <th className="text-right font-medium px-2 sm:px-3 py-2">Contado</th>
                  <th className="text-right font-medium px-2 sm:px-3 py-2">
                    <span className="sm:hidden">Dif.</span>
                    <span className="hidden sm:inline">Diferença</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.produto.id} className={`border-t border-border ${ultimo?.id === l.produto.id ? "bg-accent-soft" : ""}`}>
                    <td className="px-2 sm:px-3 py-2">
                      <div className="text-text-primary break-words">{l.produto.nome}</div>
                      <div className="text-xs text-text-tertiary font-mono">{l.produto.sku}</div>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-text-secondary">{l.produto.esperado}</td>
                    <td className="px-2 sm:px-3 py-2 text-right">
                      <input
                        className={`${inputClass} !w-16 sm:!w-20 text-right font-mono ml-auto block`}
                        inputMode="numeric"
                        aria-label={`Contagem de ${l.produto.nome}`}
                        value={l.contado ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const t = e.target.value.replace(/\D/g, "");
                          definir(l.produto.id, t === "" ? null : Math.min(1_000_000, Number(t)));
                        }}
                      />
                    </td>
                    <td
                      className={`px-2 sm:px-3 py-2 text-right font-mono ${l.diferenca === null ? "text-text-tertiary" : l.diferenca > 0 ? "text-positive" : l.diferenca < 0 ? "text-negative" : "text-text-secondary"}`}
                    >
                      {l.diferenca === null ? "—" : l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca === 0 ? "ok" : `−${-l.diferenca}`}
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-text-tertiary">
                      Nada neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-8">
        <label className="block flex-1 min-w-56">
          <span className="block text-xs text-text-secondary mb-1">Observação (opcional)</span>
          <input
            className={inputClass}
            value={observacao}
            maxLength={300}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: inventário de fim de mês"
          />
        </label>
        <Button variant="ghost" onClick={limpar} disabled={!resumo.contados || aplicando}>
          <Trash2 size={15} /> Limpar
        </Button>
        <Button variant="primary" onClick={aplicar} loading={aplicando} disabled={!resumo.contados || !migracaoOk}>
          <ClipboardCheck size={15} /> Aplicar inventário
        </Button>
      </div>

      {historico.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Inventários anteriores</h3>
          <ul className="divide-y divide-border text-sm">
            {historico.map((h) => (
              <li key={h.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span className="text-text-primary">
                  {formatarDataHora(h.criado_em)} · {nomeArmazem(h.armazem_id)}
                  {h.observacao && <span className="text-text-secondary"> · {h.observacao}</span>}
                </span>
                <span className="text-text-secondary">
                  {h.itens} contado(s) · {h.ajustes} ajuste(s)
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {ConfirmDialog}
    </>
  );
}
