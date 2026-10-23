"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Percent, RotateCcw } from "lucide-react";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarraFiltros, FiltroChips } from "@/components/ui/BarraFiltros";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/Table";
import { inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { normalizar } from "@/lib/conformidade/termos";
import { faixaValida, precosDaFaixa } from "@/lib/faixa-margem";
import type { LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-tipos";
import { salvarFaixasMargem } from "@/app/(painel)/precificacao/actions";

const PAGINA = 50;
type Faixa = { min: number; max: number } | null;
type Filtro = "todos" | "sem_faixa" | "com_faixa";

/** Em % (20 = 20%), como na tela. */
const faixaDoProduto = (p: ProdutoOpcao): Faixa => (p.margem_minima != null && p.margem_maxima != null ? { min: Math.round(p.margem_minima * 1000) / 10, max: Math.round(p.margem_maxima * 1000) / 10 } : null);
const mesma = (a: Faixa, b: Faixa) => (a === null || b === null ? a === b : a.min === b.min && a.max === b.max);

/**
 * Faixas de margem (0114): em cada produto (pai e variação) o dono define a menor e a maior
 * margem que aceita, e vê o preço mínimo e máximo que isso dá em cada loja. Os anúncios do
 * mesmo produto usam essa faixa para ter preços diferentes entre si.
 */
export function FaixasMargemView({ produtos, lojas, aliquotaDasPadrao }: { produtos: ProdutoOpcao[]; lojas: LojaOpcao[]; aliquotaDasPadrao: number }) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [lojaId, setLojaId] = useState(() => lojas.find((l) => l.tipoTaxa === "faixas")?.id ?? lojas[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [edicoes, setEdicoes] = useState<Record<string, Faixa>>({});
  const [minimo, setMinimo] = useState(20);
  const [maximo, setMaximo] = useState(30);

  const loja = lojas.find((l) => l.id === lojaId) ?? null;
  const imposto = aliquotaDasPadrao / 100;

  // Só o que se vende (sem insumo/embalagem), cada pai seguido das variações dele.
  const ordenados = useMemo(() => {
    const venda = produtos.filter((p) => p.tipo !== "insumo" && p.tipo !== "embalagem");
    const filhos = new Map<string, ProdutoOpcao[]>();
    for (const p of venda) if (p.produto_pai_id) filhos.set(p.produto_pai_id, [...(filhos.get(p.produto_pai_id) ?? []), p]);
    const ids = new Set(venda.map((p) => p.id));
    const lista: ProdutoOpcao[] = [];
    for (const p of venda) {
      if (p.produto_pai_id && ids.has(p.produto_pai_id)) continue;
      lista.push(p, ...(filhos.get(p.id) ?? []));
    }
    return lista;
  }, [produtos]);
  const filhosDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of ordenados) if (p.produto_pai_id) m.set(p.produto_pai_id, [...(m.get(p.produto_pai_id) ?? []), p.id]);
    return m;
  }, [ordenados]);

  const faixaAtual = (p: ProdutoOpcao): Faixa => (p.id in edicoes ? edicoes[p.id] : faixaDoProduto(p));
  const filtrados = ordenados.filter((p) => {
    if (busca.trim() && !normalizar(`${p.nome} ${p.sku}`).includes(normalizar(busca.trim()))) return false;
    if (filtro === "sem_faixa") return faixaAtual(p) === null;
    if (filtro === "com_faixa") return faixaAtual(p) !== null;
    return true;
  });
  const alterados = ordenados.filter((p) => p.id in edicoes && !mesma(edicoes[p.id], faixaDoProduto(p)));
  const todosMarcados = filtrados.length > 0 && filtrados.every((p) => marcados.has(p.id));

  if (ordenados.length === 0) {
    return (
      <Card>
        <EmptyState icon={Percent} title="Nenhum produto cadastrado" description="Cadastre os produtos em Produtos para definir a faixa de margem de cada um." />
      </Card>
    );
  }

  function marcar(p: ProdutoOpcao, sim: boolean) {
    // Marcar o pai leva as variações junto: é o caso comum (a mesma faixa para todas).
    const ids = [p.id, ...(filhosDe.get(p.id) ?? [])];
    setMarcados((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (sim) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }

  function aplicar(faixa: Faixa) {
    setEdicoes((e) => {
      const n = { ...e };
      for (const id of marcados) n[id] = faixa;
      return n;
    });
  }

  function editar(p: ProdutoOpcao, campo: "min" | "max", valor: number) {
    const atual = faixaAtual(p) ?? { min: minimo, max: maximo };
    setEdicoes((e) => ({ ...e, [p.id]: { ...atual, [campo]: valor } }));
  }

  function gravar() {
    const invalido = alterados.find((p) => {
      const f = edicoes[p.id];
      return f !== null && !faixaValida(f.min, f.max);
    });
    if (invalido) {
      toast.error(`Faixa inválida em “${invalido.nome}”: a mínima precisa ser menor ou igual à máxima, abaixo de 90%.`);
      return;
    }
    const itens = alterados.map((p) => {
      const f = edicoes[p.id];
      return { produto_id: p.id, margem_minima: f ? f.min / 100 : null, margem_maxima: f ? f.max / 100 : null };
    });
    startSalvar(async () => {
      const r = await executarComToast(salvarFaixasMargem({ itens }), { sucesso: `${itens.length} faixa(s) gravada(s)`, erro: "Não foi possível gravar as faixas." });
      if (r.ok) {
        setEdicoes({});
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardTitle>Faixas de margem</CardTitle>
      <CardSubtitle>
        A menor e a maior margem que você aceita em cada produto. Os anúncios do mesmo produto usam esta faixa para ter preços diferentes entre si, sem nunca ficar abaixo da mínima.
      </CardSubtitle>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <label className="block w-28">
            <span className="block text-xs font-medium text-text-secondary mb-1.5">Mínima (%)</span>
            <CampoNumero value={minimo} onChange={setMinimo} min={0} max={89.9} casas={1} />
          </label>
          <label className="block w-28">
            <span className="block text-xs font-medium text-text-secondary mb-1.5">Máxima (%)</span>
            <CampoNumero value={maximo} onChange={setMaximo} min={0} max={89.9} casas={1} />
          </label>
          <Button variant="secondary" onClick={() => aplicar({ min: minimo, max: maximo })} disabled={marcados.size === 0 || !faixaValida(minimo, maximo)}>
            Aplicar nos {marcados.size} marcados
          </Button>
          <Button variant="ghost" onClick={() => aplicar(null)} disabled={marcados.size === 0}>
            Tirar a faixa
          </Button>
          {!faixaValida(minimo, maximo) && <p className="w-full text-xs text-negative">A mínima precisa ser menor ou igual à máxima, abaixo de 90%.</p>}
        </div>
        <label className="block lg:w-64">
          <span className="block text-xs font-medium text-text-secondary mb-1.5">Preços calculados para</span>
          <select className={inputClass} value={lojaId} onChange={(e) => setLojaId(e.target.value)} disabled={lojas.length === 0}>
            {lojas.length === 0 && <option value="">Nenhuma loja cadastrada</option>}
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.canalNome} · {l.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <BarraFiltros
          busca={busca}
          onBusca={(v) => {
            setBusca(v);
            setVisiveis(PAGINA);
          }}
          placeholder="Buscar produto ou SKU"
          ativos={filtro === "todos" ? 0 : 1}
          onLimpar={() => {
            setBusca("");
            setFiltro("todos");
          }}
          situacao={
            <FiltroChips
              rotulo="Faixa"
              valor={filtro}
              onChange={(v) => {
                setFiltro(v);
                setVisiveis(PAGINA);
              }}
              opcoes={[
                { valor: "todos", rotulo: "Todos" },
                { valor: "sem_faixa", rotulo: "Sem faixa" },
                { valor: "com_faixa", rotulo: "Com faixa" },
              ]}
            />
          }
        />
      </div>

      <Table className="mt-3">
        <Thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Marcar todos os da lista"
                checked={todosMarcados}
                onChange={(e) =>
                  setMarcados((s) => {
                    const n = new Set(s);
                    for (const p of filtrados) {
                      if (e.target.checked) n.add(p.id);
                      else n.delete(p.id);
                    }
                    return n;
                  })
                }
              />
            </Th>
            <Th>Produto</Th>
            <Th align="right" secundaria>
              Custo
            </Th>
            <Th align="right">Mín. %</Th>
            <Th align="right">Máx. %</Th>
            <Th align="right">Preço mín.</Th>
            <Th align="right">Preço máx.</Th>
          </tr>
        </Thead>
        <tbody>
          {filtrados.slice(0, visiveis).map((p) => {
            const f = faixaAtual(p);
            const precos = f && loja && faixaValida(f.min, f.max) ? precosDaFaixa(Number(p.custo), loja, imposto, { minima: f.min / 100, maxima: f.max / 100 }) : null;
            const mudou = alterados.some((a) => a.id === p.id);
            const campo = "w-20 ml-auto rounded-md border border-border bg-surface-1 px-2 py-1.5 text-right font-mono text-sm text-text-primary";
            return (
              <Tr key={p.id} selecionada={marcados.has(p.id)}>
                <Td>
                  <input type="checkbox" aria-label={`Marcar ${p.nome}`} checked={marcados.has(p.id)} onChange={(e) => marcar(p, e.target.checked)} />
                </Td>
                <Td>
                  <span className={`block min-w-0 ${p.produto_pai_id ? "pl-4" : ""}`}>
                    <span className="block font-medium text-text-primary">
                      {p.produto_pai_id && <span className="text-text-tertiary">↳ </span>}
                      {p.nome}
                      {mudou && <span className="ml-1.5 text-xs font-normal text-accent">alterado</span>}
                    </span>
                    <span className="block font-mono text-xs text-text-tertiary">{p.sku}</span>
                  </span>
                </Td>
                <Td align="right" mono secundaria>
                  {Number(p.custo) > 0 ? formatBRL(Number(p.custo)) : "—"}
                </Td>
                <Td align="right">
                  <CampoNumero aria-label={`Margem mínima de ${p.nome}`} className={campo} value={f?.min ?? 0} onChange={(n) => editar(p, "min", n)} min={0} max={89.9} casas={1} />
                </Td>
                <Td align="right">
                  <CampoNumero aria-label={`Margem máxima de ${p.nome}`} className={campo} value={f?.max ?? 0} onChange={(n) => editar(p, "max", n)} min={0} max={89.9} casas={1} />
                </Td>
                <Td align="right" mono className={precos?.minimo ? "" : "text-text-tertiary"}>
                  {precos?.minimo ? formatBRL(precos.minimo) : f && !faixaValida(f.min, f.max) ? <span className="text-negative">inválida</span> : Number(p.custo) > 0 ? "—" : "sem custo"}
                </Td>
                <Td align="right" mono className={precos?.maximo ? "" : "text-text-tertiary"}>
                  {precos?.maximo ? formatBRL(precos.maximo) : "—"}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      {filtrados.length === 0 && <p className="py-6 text-center text-sm text-text-secondary">Nenhum produto com esse filtro.</p>}
      {filtrados.length > visiveis && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setVisiveis((n) => n + PAGINA)}>
            Mostrar mais {Math.min(PAGINA, filtrados.length - visiveis)} de {filtrados.length - visiveis}
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-text-secondary">{alterados.length ? `${alterados.length} produto(s) com a faixa alterada.` : "Nenhuma faixa alterada."}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setEdicoes({})} disabled={salvando || alterados.length === 0}>
            <RotateCcw size={14} aria-hidden /> Desfazer
          </Button>
          <Button variant="primary" onClick={gravar} loading={salvando} disabled={salvando || alterados.length === 0}>
            Gravar faixas
          </Button>
        </div>
      </div>
    </Card>
  );
}
