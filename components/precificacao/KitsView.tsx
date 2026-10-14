"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PackagePlus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { calcularKit, nomeDoKit, type ItemKit, type ModoKit } from "@/lib/kit";
import type { LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-tipos";
import { criarProdutoDePrecificacao, salvarPrecificacao } from "@/app/(painel)/precificacao/actions";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const MODOS: { id: ModoKit; rotulo: string; ajuda: string }[] = [
  { id: "margem", rotulo: "Margem alvo", ajuda: "Margem líquida desejada (%)" },
  { id: "desconto", rotulo: "Desconto sobre o avulso", ajuda: "Desconto para o cliente (%) sobre a soma dos preços avulsos" },
  { id: "preco", rotulo: "Preço fixo", ajuda: "Preço do kit (R$)" },
];

/**
 * Calculadora → Kits: junta produtos do estoque, soma o custo (+ embalagem), calcula o preço
 * pelo canal e compara com vender cada item separado. Salva como precificação (os itens
 * viram a composição) e pode virar produto na hora.
 */
export function KitsView({ produtos, lojas, aliquotaDasPadrao }: { produtos: ProdutoOpcao[]; lojas: LojaOpcao[]; aliquotaDasPadrao: number }) {
  const [pending, startTransition] = useTransition();
  const [itens, setItens] = useState<ItemKit[]>([]);
  const [busca, setBusca] = useState("");
  const [extra, setExtra] = useState(0);
  const [lojaId, setLojaId] = useState<string>("");
  const [imposto, setImposto] = useState(aliquotaDasPadrao);
  const [modo, setModo] = useState<ModoKit>("desconto");
  const [parametro, setParametro] = useState(10);
  const [nome, setNome] = useState("");

  const loja = lojas.find((l) => l.id === lojaId) ?? null;
  const r = useMemo(() => calcularKit({ itens, extra, loja, impostoPct: imposto, modo, parametro }), [itens, extra, loja, imposto, modo, parametro]);
  const sugestoes = busca.trim()
    ? produtos.filter((p) => !itens.some((i) => i.produtoId === p.id) && `${p.nome} ${p.sku}`.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 8)
    : [];
  const nomeFinal = nome.trim() || nomeDoKit(itens);

  function adicionar(p: ProdutoOpcao) {
    setItens((x) => [...x, { id: p.id, produtoId: p.id, nome: p.nome, quantidade: 1, custo: Number(p.custo), preco: Number(p.preco_venda) }]);
    setBusca("");
  }

  /** Item que ainda não existe no cadastro: o dono digita nome, custo e preço avulso. */
  function adicionarSemCadastro() {
    setItens((x) => [...x, { id: `livre-${crypto.randomUUID()}`, produtoId: null, nome: "", quantidade: 1, custo: 0, preco: 0 }]);
  }

  function mudarItem(id: string, parcial: Partial<ItemKit>) {
    setItens((x) => x.map((y) => (y.id === id ? { ...y, ...parcial } : y)));
  }

  const semCadastro = itens.filter((i) => i.produtoId === null);
  const semNome = semCadastro.some((i) => !i.nome.trim());

  function salvar(criarProduto: boolean) {
    const res = r.resultado;
    if (!res.viavel || !itens.length || semNome) return;
    const taxaFixa = Math.max(0, res.precoVenda - res.custoTotal - res.lucroLiquido - res.taxaVariavelValor - res.taxaAdicionalValor - res.impostoValor - res.taxaExtraCalculada);
    startTransition(async () => {
      const s = await executarComToast(
        salvarPrecificacao({
          produto_id: null,
          produto_nome: nomeFinal,
          canal: loja ? loja.canalNome : "Venda direta",
          titulo_anuncio: null,
          loja_id: loja?.id ?? null,
          componentes: [
            // Item sem cadastro entra só como custo (sem `produtoId`): não há estoque para baixar.
            ...itens.map((i) => ({ id: i.id, nome: i.nome.trim() || "Item", quantidade: i.quantidade, custoUnitario: i.custo, ...(i.produtoId ? { produtoId: i.produtoId } : {}) })),
            ...(extra > 0 ? [{ id: "embalagem-kit", nome: "Embalagem do kit", quantidade: 1, custoUnitario: extra }] : []),
          ],
          taxa_extra_valor: loja?.taxaExtraValor ?? null,
          taxa_extra_tipo: loja?.taxaExtraTipo ?? null,
          custo: r.custoKit,
          taxa_variavel_pct: res.precoVenda > 0 ? res.taxaVariavelValor / res.precoVenda : 0,
          taxa_fixa: Math.round(taxaFixa * 100) / 100,
          taxa_adicional_pct: 0,
          imposto_pct: imposto / 100,
          margem_pct: Math.max(-1, Math.min(1, res.margemEfetivaPct)),
          preco_calculado: Math.round(res.precoVenda * 100) / 100,
          lucro: Math.round(res.lucroLiquido * 100) / 100,
          origem: "individual",
        }),
        { erro: "Erro ao salvar o kit" },
      );
      if (!s.ok) return;
      if (!criarProduto || !s.dado.id) return void toast.success("Kit salvo em Precificações salvas.");
      // (o botão de criar produto só fica ativo sem item "sem cadastro")
      const p = await executarComToast(criarProdutoDePrecificacao(s.dado.id, { kit: true }), { erro: "Kit salvo, mas não deu para criar o produto" });
      if (p.ok) toast.success(`Kit "${nomeFinal}" criado: vender o kit baixa cada item, e o estoque dele é quantos dá para montar.`);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <h3 className="text-sm font-medium text-text-primary mb-3">Itens do kit</h3>
          <div className="relative mb-3 flex gap-2">
            <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto pelo nome ou SKU para adicionar…" aria-label="Adicionar produto ao kit" />
            <Button type="button" variant="secondary" className="shrink-0" onClick={adicionarSemCadastro}>
              + Item sem cadastro
            </Button>
            {sugestoes.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-1 border border-border rounded-md shadow-elev-2 max-h-60 overflow-auto">
                {sugestoes.map((p) => (
                  <button key={p.id} type="button" onClick={() => adicionar(p)} className="w-full flex justify-between gap-3 text-left px-3 py-2 text-sm hover:bg-surface-2">
                    <span className="text-text-primary truncate">
                      <span className="font-mono text-xs text-text-tertiary">{p.sku}</span> {p.nome}
                    </span>
                    <span className="font-mono text-xs text-text-secondary shrink-0">
                      custo {formatBRL(Number(p.custo))} · venda {formatBRL(Number(p.preco_venda))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {itens.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-6">Adicione os produtos que vão no kit (ex.: 2 canecas + 1 pires). Ainda não cadastrou um deles? Use &quot;+ Item sem cadastro&quot; e informe nome, custo e preço.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-md">
              {itens.map((i) =>
                i.produtoId === null ? (
                  <div key={i.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_auto] items-center gap-2 px-3 py-2 text-sm bg-surface-2/40">
                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-secondary">sem cadastro</span>
                      <input className={`${inputClass} h-8`} value={i.nome} maxLength={120} aria-label="Nome do item sem cadastro" placeholder="Nome do item" onChange={(e) => mudarItem(i.id, { nome: e.target.value })} />
                    </div>
                    <CampoNumero padrao={1} min={1} className={`${inputClass} h-8 text-right`} value={i.quantidade} aria-label={`Quantidade de ${i.nome || "item"}`} onChange={(n) => mudarItem(i.id, { quantidade: Math.max(1, Math.floor(n)) })} />
                    <CampoNumero className={`${inputClass} h-8 text-right`} value={i.custo} aria-label={`Custo unitário de ${i.nome || "item"}`} placeholder="custo un." onChange={(n) => mudarItem(i.id, { custo: Math.max(0, n) })} />
                    <CampoNumero className={`${inputClass} h-8 text-right`} value={i.preco} aria-label={`Preço avulso de ${i.nome || "item"}`} placeholder="preço avulso" onChange={(n) => mudarItem(i.id, { preco: Math.max(0, n) })} />
                    <IconButton aria-label={`Tirar ${i.nome || "item"}`} onClick={() => setItens((x) => x.filter((y) => y.id !== i.id))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ) : (
                  <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_auto] items-center gap-2 px-3 py-2 text-sm">
                    <span className="truncate text-text-primary" title={i.nome}>
                      {i.nome}
                    </span>
                    <CampoNumero
                      padrao={1}
                      min={1}
                      className={`${inputClass} h-8 text-right`}
                      value={i.quantidade}
                      aria-label={`Quantidade de ${i.nome}`}
                      onChange={(n) => mudarItem(i.id, { quantidade: Math.max(1, Math.floor(n)) })}
                    />
                    <span className="hidden sm:block font-mono text-xs text-text-secondary text-right">custo {formatBRL(i.custo * i.quantidade)}</span>
                    <span className="hidden sm:block font-mono text-xs text-text-secondary text-right">avulso {formatBRL(i.preco * i.quantidade)}</span>
                    <IconButton aria-label={`Tirar ${i.nome}`} onClick={() => setItens((x) => x.filter((y) => y.id !== i.id))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ),
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <FormField label="Embalagem / brinde por kit (R$)">
              <CampoNumero value={extra} onChange={setExtra} min={0} casas={2} placeholder="0,00" />
            </FormField>
            <FormField label="Nome do kit">
              <input className={inputClass} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={nomeDoKit(itens)} />
            </FormField>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-medium text-text-primary mb-3">Onde vai vender e como calcular</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Canal / loja">
              <select className={inputClass} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
                <option value="">Venda direta (PDV, catálogo)</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.canalNome} · {l.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Imposto (%)">
              <CampoNumero value={imposto} onChange={setImposto} min={0} />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {MODOS.map((m) => (
              <Chip key={m.id} ativo={modo === m.id} onClick={() => (setModo(m.id), setParametro(m.id === "preco" ? Math.round(r.precoAvulso * 0.9 * 100) / 100 : m.id === "margem" ? 20 : 10))}>
                {m.rotulo}
              </Chip>
            ))}
          </div>
          <FormField label={MODOS.find((m) => m.id === modo)!.ajuda}>
            <CampoNumero value={parametro} onChange={setParametro} min={0} />
          </FormField>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <div className="text-xs text-text-tertiary mb-1">Preço do kit</div>
          <div className="text-3xl font-mono font-semibold text-accent mb-1">{r.resultado.viavel ? formatBRL(r.resultado.precoVenda) : "—"}</div>
          {!r.resultado.viavel && itens.length > 0 && <p className="text-sm text-negative mb-2">Com essas taxas e essa margem não fecha a conta. Baixe a margem ou o desconto.</p>}
          {r.resultado.viavel && (
            <div className="space-y-1.5 text-sm">
              <Linha rotulo="Custo do kit" valor={formatBRL(r.custoKit)} />
              <Linha rotulo="Taxas do canal e imposto" valor={formatBRL(r.resultado.precoVenda - r.custoKit - r.resultado.lucroLiquido)} />
              <Linha rotulo="Lucro" valor={`${formatBRL(r.resultado.lucroLiquido)} · ${pct(r.resultado.margemEfetivaPct)}`} destaque={r.resultado.lucroLiquido >= 0 ? "positivo" : "negativo"} />
              <div className="border-t border-border my-2" />
              <Linha rotulo="Separado, o cliente pagaria" valor={formatBRL(r.precoAvulso)} />
              <Linha rotulo="Economia do cliente" valor={`${formatBRL(r.economia)} · ${pct(r.economiaPct)}`} />
              <Linha rotulo="Seu lucro vendendo separado" valor={formatBRL(r.lucroAvulso)} />
              <p className={`text-xs mt-2 ${r.diferencaLucro >= 0 ? "text-positive" : "text-negative"}`}>
                {r.diferencaLucro >= 0
                  ? `O kit rende ${formatBRL(r.diferencaLucro)} a mais que vender separado${loja ? " (a tarifa fixa do canal é paga uma vez só)" : ""}.`
                  : `O kit rende ${formatBRL(-r.diferencaLucro)} a menos que vender separado: vale se ele aumentar as vendas.`}
              </p>
            </div>
          )}
        </Card>
        <Card className="space-y-2">
          <Button variant="primary" className="w-full" disabled={!r.resultado.viavel || !itens.length || semCadastro.length > 0} loading={pending} onClick={() => salvar(true)}>
            <PackagePlus size={14} /> Salvar e criar produto
          </Button>
          <Button variant="secondary" className="w-full" disabled={!r.resultado.viavel || !itens.length || pending || semNome} onClick={() => salvar(false)}>
            Só salvar a precificação
          </Button>
          {semCadastro.length > 0 && (
            <p className="text-[11px] text-text-tertiary">
              {semNome ? "Dê um nome a cada item sem cadastro para salvar. " : ""}
              Para criar o produto kit, cadastre {semCadastro.length === 1 ? "o item sem cadastro" : "os itens sem cadastro"}: o kit baixa o estoque de cada item. Você pode salvar só a precificação agora.
            </p>
          )}
          <p className="text-[11px] text-text-tertiary">O kit nasce com os itens na composição: o custo é a soma deles e o estoque é quantos kits dá para montar. Vender o kit baixa cada item.</p>
        </Card>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: "positivo" | "negativo" }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-secondary">{rotulo}</span>
      <span className={`font-mono ${destaque === "positivo" ? "text-positive font-semibold" : destaque === "negativo" ? "text-negative font-semibold" : "text-text-primary"}`}>{valor}</span>
    </div>
  );
}
