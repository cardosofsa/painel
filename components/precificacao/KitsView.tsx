"use client";
import { produtosParaBusca } from "@/lib/precificacao-tipos";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Copy, ImageIcon, MessageCircle, PackageOpen, PackagePlus, Plus, Trash2 } from "lucide-react";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { Button, IconButton } from "@/components/ui/Button";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { classeValor, formatBRL } from "@/lib/format";
import { ComoLucrar, DICA_MARGEM, Metrica, OndeVende, Passo, type ModoOpcao } from "@/components/precificacao/blocos";
import { AvisoRascunho, IndicadorRascunho } from "@/components/precificacao/RascunhoAviso";
import { Combobox } from "@/components/ui/Combobox";
import { BotaoCusto, SeletorCusto, type CustoEscolhido } from "@/components/precificacao/SeletorCusto";
import { FotoPrecificacao } from "@/components/precificacao/FotoPrecificacao";
import { avisoDaFaixa, faixaInvertida, normalizarFaixa } from "@/lib/faixa-venda";
import { lerId, lerLista, lerNumero, lerTexto, useRascunhoDaAba, type RascunhoPendente, type RelatarRascunho } from "@/lib/precificacao-rascunho";
import { margemAtingida } from "@/lib/pricing";
import { useExportarPrecificacao, type ResumoExport } from "@/components/precificacao/resultado-compartilhado";
import { calcularKit, nomeDoKit, quantidadeEmUnidadeDePreco, textoQuantidade, UNIDADES_KIT, type ItemKit, type ModoKit, type UnidadeKit } from "@/lib/kit";
import type { LojaOpcao, ProdutoOpcao } from "@/lib/precificacao-tipos";
import { criarProdutoDePrecificacao, salvarPrecificacao } from "@/app/(painel)/precificacao/actions";

const CAMPOS = "grid-cols-2 sm:grid-cols-[6rem_5rem_minmax(0,1fr)_minmax(0,1fr)_6rem]";
const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const MODOS: ModoOpcao<ModoKit>[] = [
  { id: "margem", rotulo: "Margem", campo: "Margem líquida (%)", dica: DICA_MARGEM },
  { id: "desconto", rotulo: "Desconto", campo: "Desconto sobre o avulso (%)", dica: "Desconto para o cliente sobre a soma dos preços dos itens vendidos separados." },
  { id: "preco", rotulo: "Preço fixo", campo: "Preço do kit (R$)" },
];

/**
 * Calculadora → Kits: junta produtos do estoque, soma o custo (+ embalagem), calcula o preço
 * pelo canal e compara com vender cada item separado. Salva como precificação (os itens
 * viram a composição) e pode virar produto na hora.
 */
export function KitsView({
  produtos,
  lojas,
  aliquotaDasPadrao,
  empresa = null,
  rascunhoPendente = null,
  relatar,
  confirm,
}: {
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  aliquotaDasPadrao: number;
  empresa?: { nome: string | null; logoUrl: string | null } | null;
  /** Rascunho desta aba guardado no banco (0100). */
  rascunhoPendente?: RascunhoPendente | null;
  relatar?: RelatarRascunho;
  confirm: (o: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [itens, setItens] = useState<ItemKit[]>([]);
  const [extra, setExtra] = useState(0);
  const [escolhendoCusto, setEscolhendoCusto] = useState(false);
  const [lojaId, setLojaId] = useState<string>("");
  const [imposto, setImposto] = useState(aliquotaDasPadrao);
  const [modo, setModo] = useState<ModoKit>("desconto");
  const [parametro, setParametro] = useState(10);
  const [nome, setNome] = useState("");
  const [precoMinimo, setPrecoMinimo] = useState(0);
  const [precoMaximo, setPrecoMaximo] = useState(0);
  // Foto própria do kit (0045): item puxado de "Custo" ou sem cadastro não tem foto.
  const [imagemPropria, setImagemPropria] = useState<string | null>(null);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao(empresa);

  const loja = lojas.find((l) => l.id === lojaId) ?? null;
  const r = useMemo(() => calcularKit({ itens, extra, loja, impostoPct: imposto, modo, parametro, precoMinimo, precoMaximo }), [itens, extra, loja, imposto, modo, parametro, precoMinimo, precoMaximo]);
  const nomeFinal = nome.trim() || nomeDoKit(itens);

  const aba = useRascunhoDaAba({
    visao: "kits",
    instantaneo: { itens, extra, lojaId, imposto, modo, parametro, nome, precoMinimo, precoMaximo, imagemPropria },
    temConteudo: itens.length > 0,
    titulo: nomeFinal || "Kit",
    pendenteInicial: rascunhoPendente,
    relatar,
    confirm,
    aplicar: (d) => {
      setItens(
        lerLista<ItemKit>(d.itens, (x) => {
          if (typeof x.id !== "string" || typeof x.nome !== "string") return null;
          const produtoId = lerId(x.produtoId);
          // Produto apagado do cadastro depois do rascunho: o item sai.
          if (produtoId && !produtos.some((p) => p.id === produtoId)) return null;
          const unidade = UNIDADES_KIT.some((u) => u.id === x.unidade) ? (x.unidade as UnidadeKit) : undefined;
          return { id: x.id, produtoId, nome: x.nome, quantidade: lerNumero(x.quantidade, 1), ...(unidade ? { unidade } : {}), custo: lerNumero(x.custo, 0), preco: lerNumero(x.preco, 0) };
        }),
      );
      setExtra(lerNumero(d.extra, 0));
      const lid = lerTexto(d.lojaId);
      setLojaId(lojas.some((l) => l.id === lid) ? lid : "");
      setImposto(lerNumero(d.imposto, aliquotaDasPadrao));
      setModo(MODOS.some((m) => m.id === d.modo) ? (d.modo as ModoKit) : "desconto");
      setParametro(lerNumero(d.parametro, 10));
      setNome(lerTexto(d.nome));
      setPrecoMinimo(lerNumero(d.precoMinimo, 0));
      setPrecoMaximo(lerNumero(d.precoMaximo, 0));
      const foto = lerTexto(d.imagemPropria);
      setImagemPropria(/^https:\/\//.test(foto) ? foto : null);
    },
  });

  function adicionar(p: ProdutoOpcao) {
    setItens((x) => [...x, { id: p.id, produtoId: p.id, nome: p.nome, quantidade: 1, custo: Number(p.custo), preco: Number(p.preco_venda) }]);
  }

  /** Item que ainda não existe no cadastro: o dono digita nome, custo e preço avulso. */
  function adicionarSemCadastro(nomeInicial = "") {
    setItens((x) => [...x, { id: `livre-${crypto.randomUUID()}`, produtoId: null, nome: nomeInicial.trim().slice(0, 120), quantidade: 1, unidade: "un", custo: 0, preco: 0 }]);
  }

  /** Custos registrados (não são produto): entram como item sem cadastro, com o custo e a unidade deles. */
  function adicionarCustos(escolhidos: CustoEscolhido[]) {
    setItens((x) => [
      ...x,
      ...escolhidos.map(({ custo: c }) => ({
        id: `custo-${c.id}-${crypto.randomUUID().slice(0, 8)}`,
        produtoId: null,
        nome: c.nome.slice(0, 120),
        quantidade: 1,
        // kg e L: o kit já trabalha com custo por kg/L e quantidade em kg/L, g ou ml.
        unidade: (c.unidade === "kg" ? "kg" : c.unidade === "l" ? "l" : "un") as UnidadeKit,
        custo: c.custo,
        preco: 0,
      })),
    ]);
    setEscolhendoCusto(false);
  }

  function mudarItem(id: string, parcial: Partial<ItemKit>) {
    setItens((x) => x.map((y) => (y.id === id ? { ...y, ...parcial } : y)));
  }

  const semCadastro = itens.filter((i) => i.produtoId === null);
  const semNome = semCadastro.some((i) => !i.nome.trim());
  const primeiroComFoto = itens.map((i) => produtos.find((p) => p.id === i.produtoId)?.imagem_url).find(Boolean) ?? null;
  const faixa = normalizarFaixa(precoMinimo, precoMaximo);
  const faixaErrada = faixaInvertida(faixa);

  /** O que a tarifa fixa do canal cobrou neste preço (o motor devolve só o lucro, então é o resto). */
  const taxaFixaDoKit = Math.max(0, r.resultado.precoVenda - r.resultado.custoTotal - r.resultado.lucroLiquido - r.resultado.taxaVariavelValor - r.resultado.taxaAdicionalValor - r.resultado.impostoValor - r.resultado.taxaExtraCalculada);

  /** Resumo para copiar / WhatsApp / imagem: itens, embalagem, taxas, faixa de venda e comparação com o avulso. */
  function resumoDoKit(): ResumoExport {
    const res = r.resultado;
    const min = r.faixaVenda.minimo;
    const max = r.faixaVenda.maximo;
    return {
      titulo: nomeFinal,
      canal: loja ? `${loja.canalNome} · ${loja.nome}` : "Venda direta",
      imagemUrl: imagemPropria ?? primeiroComFoto,
      precoVenda: res.precoVenda,
      custoTotal: r.custoKit,
      taxaVariavelValor: res.taxaVariavelValor,
      taxaVariavelPct: res.precoVenda > 0 ? res.taxaVariavelValor / res.precoVenda : 0,
      taxaFixa: Math.round(taxaFixaDoKit * 100) / 100,
      taxaAdicionalValor: res.taxaAdicionalValor,
      taxaAdicionalPct: 0,
      impostoValor: res.impostoValor,
      impostoPct: imposto / 100,
      taxaExtraCalculada: res.taxaExtraCalculada,
      lucroLiquido: res.lucroLiquido,
      margemEfetivaPct: res.margemEfetivaPct,
      componentes: [
        ...itens.map((i) => ({ id: i.id, nome: `${textoQuantidade(i)} ${i.nome.trim() || "Item"}`, quantidade: 1, custoUnitario: i.custo * quantidadeEmUnidadeDePreco(i) })),
        ...(extra > 0 ? [{ id: "embalagem-kit", nome: "Embalagem / brinde", quantidade: 1, custoUnitario: extra }] : []),
      ],
      faixaVenda:
        min && max
          ? { precoMinimo: min.precoVenda, precoMaximo: max.precoVenda, lucroMinimo: min.lucroLiquido, margemMinimaPct: min.margemEfetivaPct, lucroMaximo: max.lucroLiquido, margemMaximaPct: max.margemEfetivaPct }
          : null,
      kit: { precoAvulso: r.precoAvulso, economia: r.economia, economiaPct: r.economiaPct, lucroAvulso: r.lucroAvulso },
    };
  }

  function salvar(criarProduto: boolean) {
    const res = r.resultado;
    if (!res.viavel || !itens.length || semNome) return;
    if (faixaErrada) return void toast.error("O preço mínimo está maior que o máximo.");
    const taxaFixa = taxaFixaDoKit;
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
            // Peso/volume vira uma linha só ("Farinha (250 g)") com o custo da porção.
            ...itens.map((i) => {
              if (i.produtoId) return { id: i.id, nome: i.nome, quantidade: i.quantidade, custoUnitario: i.custo, produtoId: i.produtoId };
              const porUnidade = (i.unidade ?? "un") === "un";
              return {
                id: i.id,
                nome: porUnidade ? i.nome.trim() || "Item" : `${i.nome.trim() || "Item"} (${textoQuantidade(i)})`,
                quantidade: porUnidade ? i.quantidade : 1,
                custoUnitario: porUnidade ? i.custo : Math.round(i.custo * quantidadeEmUnidadeDePreco(i) * 10000) / 10000,
              };
            }),
            ...(extra > 0 ? [{ id: "embalagem-kit", nome: "Embalagem do kit", quantidade: 1, custoUnitario: extra }] : []),
          ],
          taxa_extra_valor: loja?.taxaExtraValor ?? null,
          taxa_extra_tipo: loja?.taxaExtraTipo ?? null,
          custo: r.custoKit,
          taxa_variavel_pct: res.precoVenda > 0 ? res.taxaVariavelValor / res.precoVenda : 0,
          taxa_fixa: Math.round(taxaFixa * 100) / 100,
          taxa_adicional_pct: 0,
          imposto_pct: imposto / 100,
          margem_pct: margemAtingida(res),
          preco_calculado: Math.round(res.precoVenda * 100) / 100,
          lucro: Math.round(res.lucroLiquido * 100) / 100,
          origem: "individual",
          imagem_url: imagemPropria,
          preco_minimo: faixa.minimo,
          preco_maximo: faixa.maximo,
        }, aba.rasc.rascunhoId),
        { erro: "Erro ao salvar o kit" },
      );
      if (!s.ok) return;
      // O servidor já apagou o rascunho junto com o salvamento.
      aba.rasc.aoSalvarPrecificacao();
      if (!criarProduto || !s.dado.id) return void toast.success("Kit salvo em Precificações salvas.");
      // (o botão de criar produto só fica ativo sem item "sem cadastro")
      const p = await executarComToast(criarProdutoDePrecificacao(s.dado.id, { kit: true }), { erro: "Kit salvo, mas não deu para criar o produto" });
      if (p.ok) toast.success(`Kit "${nomeFinal}" criado: vender o kit baixa cada item, e o estoque dele é quantos dá para montar.`);
    });
  }

  const res = r.resultado;
  const temItens = itens.length > 0;
  const viavel = temItens && res.viavel;
  const taxasEImposto = res.precoVenda - r.custoKit - res.lucroLiquido;
  // Barra "cliente paga": o kit em relação à soma dos itens avulsos.
  const fracaoKit = r.precoAvulso > 0 && viavel ? Math.min(1, res.precoVenda / r.precoAvulso) : 0;
  const avisoFaixa = viavel ? avisoDaFaixa(res.precoVenda, faixa, formatBRL) : null;

  return (
    <>
      {aba.pendente && <AvisoRascunho pendente={aba.pendente} onContinuar={aba.continuar} onDescartar={() => void aba.descartar()} />}
      {escolhendoCusto && <SeletorCusto multiplo onFechar={() => setEscolhendoCusto(false)} onEscolher={adicionarCustos} />}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start pb-24 lg:pb-0">
        <div className="space-y-5 min-w-0">
          <Card padding="nenhum">
            <Passo n={1} titulo="O que vai no kit" resumo={temItens ? `${itens.length} ite${itens.length === 1 ? "m" : "ns"} · custo ${formatBRL(r.custoKit)}` : null}>
              <div className="mb-3 flex flex-col sm:flex-row gap-2">
                <Combobox
                  className="flex-1"
                  ariaLabel="Adicionar produto ao kit"
                  limparAoEscolher
                  itens={produtosParaBusca(produtos).filter((p) => !itens.some((i) => i.produtoId === p.id)).map((p) => ({ id: p.id, rotulo: p.nome, busca: p.sku, detalhe: `custo ${formatBRL(Number(p.custo))} · venda ${formatBRL(Number(p.preco_venda))}` }))}
                  valor={null}
                  onChange={(id) => {
                    const p = produtos.find((x) => x.id === id);
                    if (p) adicionar(p);
                  }}
                  criar={{ rotulo: (t) => `+ Adicionar “${t}” sem cadastro`, onCriar: adicionarSemCadastro }}
                  placeholder="Buscar produto pelo nome ou SKU para adicionar…"
                />
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => adicionarSemCadastro()}>
                  <Plus size={14} aria-hidden /> Item sem cadastro
                </Button>
                <span className="flex shrink-0 items-center">
                  <BotaoCusto onClick={() => setEscolhendoCusto(true)} rotulo="Custo" />
                </span>
              </div>
              {!temItens ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <PackageOpen size={18} aria-hidden />
                  </span>
                  <p className="text-sm font-medium text-text-primary">Monte o kit</p>
                  <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">Busque os produtos (ex.: 2 canecas + 1 pires). Ainda não cadastrou um deles? Use “Item sem cadastro” e informe custo e preço, ou puxe de “Custo”.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {itens.map((i) => (
                    <LinhaItem key={i.id} item={i} onChange={(parcial) => mudarItem(i.id, parcial)} onRemover={() => setItens((x) => x.filter((y) => y.id !== i.id))} />
                  ))}
                  {itens.some((i) => (i.unidade ?? "un") !== "un") && (
                    <p className="text-xs text-text-tertiary">Em g e ml, custo e preço são por kg e por litro (como você compra): 250 g a R$ 30/kg custa R$ 7,50.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 [&>*]:mb-0">
                <FormField label="Nome do kit">
                  <input className={inputClass} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={nomeDoKit(itens) || "Ex.: Kit Café da Manhã"} />
                </FormField>
                <FormField label="Embalagem / brinde por kit (R$)">
                  <CampoNumero value={extra} onChange={setExtra} min={0} casas={2} placeholder="0,00" />
                </FormField>
              </div>
              <div className="mt-3">
                <FotoPrecificacao propria={imagemPropria} doProduto={primeiroComFoto} onChange={setImagemPropria} />
              </div>
            </Passo>

            <Passo n={2} titulo="Onde vende" resumo={loja ? `${loja.canalNome} · ${loja.nome}` : "venda direta"}>
              <OndeVende lojas={lojas} lojaId={lojaId || null} onEscolher={(id) => setLojaId(id ?? "")} semLoja={{ titulo: "Venda direta", sub: "PDV, catálogo, sem comissão" }} />
            </Passo>

            <Passo n={3} titulo="Como quer lucrar">
              <ComoLucrar
                modos={MODOS}
                modo={modo}
                onModo={(m) => {
                  if (m === modo) return;
                  setModo(m);
                  setParametro(m === "preco" ? Math.round(r.precoAvulso * 0.9 * 100) / 100 : m === "margem" ? 20 : 10);
                }}
                valor={parametro}
                onValor={setParametro}
              />
            </Passo>

            <Passo n={4} titulo="Faixa de venda" resumo={faixa.minimo !== null || faixa.maximo !== null ? "o menor e o maior preço que aceita" : "opcional"} ultimo>
              <p className="mb-3 text-xs text-text-secondary">O menor e o maior preço que você aceitaria no kit: mostra o lucro em cada ponta, para negociar sem perder dinheiro.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
                <FormField label="Preço mínimo do kit (R$)">
                  <CampoNumero value={precoMinimo} onChange={setPrecoMinimo} min={0} casas={2} placeholder="Ex.: 79,90" />
                </FormField>
                <FormField label="Preço máximo do kit (R$)">
                  <CampoNumero value={precoMaximo} onChange={setPrecoMaximo} min={0} casas={2} placeholder="Ex.: 129,90" />
                </FormField>
              </div>
              {faixaErrada ? (
                <p className="mt-2 text-xs text-negative">O mínimo está maior que o máximo.</p>
              ) : (
                (r.faixaVenda.minimo || r.faixaVenda.maximo) && (
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["Lucro no mínimo", r.faixaVenda.minimo],
                        ["Lucro no máximo", r.faixaVenda.maximo],
                      ] as const
                    ).map(([rotulo, f]) => (
                      <Metrica key={rotulo} rotulo={rotulo} valor={f ? `${formatBRL(f.lucroLiquido)} · ${pct(f.margemEfetivaPct)}` : "—"} classe={f ? classeValor(f.lucroLiquido) : "text-text-tertiary"} />
                    ))}
                  </dl>
                )
              )}
            </Passo>
          </Card>

          <Card>
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between list-none">
                <span>
                  <CardTitle>Mais opções</CardTitle>
                  <span className="block text-xs text-text-secondary">Imposto</span>
                </span>
                <ChevronDown size={18} className="text-text-tertiary transition-transform duration-[--duracao-media] group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*]:mb-0">
                <FormField label="Imposto (%)">
                  <CampoNumero value={imposto} onChange={setImposto} min={0} max={50} />
                </FormField>
              </div>
            </details>
          </Card>
        </div>

        {/* Resultado: fixo ao rolar no computador, no mesmo desenho da Individual. */}
        <div className="lg:sticky lg:top-20">
          <Card className={temItens && !res.viavel ? "border-negative/40" : ""}>
            <div id="resultado-kit" className="scroll-mt-20" />
            <div className="flex items-center justify-between gap-2">
              <CardEyebrow>Preço do kit</CardEyebrow>
              {temItens && <StatusChip label={res.viavel ? "Viável" : "Inviável"} tone={res.viavel ? "positive" : "negative"} />}
            </div>
            <div key={res.precoVenda} className="destaque-valor rounded-md -mx-1 px-1 mt-1 font-mono text-4xl font-semibold tracking-tight text-text-primary" aria-live="polite">
              {viavel ? formatBRL(res.precoVenda) : "—"}
            </div>
            <div className="text-xs text-text-tertiary truncate">{nomeFinal || "Kit"} · {loja ? `${loja.canalNome} · ${loja.nome}` : "Venda direta"}</div>

            {!temItens ? (
              <p className="mt-4 text-sm text-text-secondary">Adicione os itens para ver o preço, o lucro e quanto o cliente economiza.</p>
            ) : !res.viavel ? (
              <p className="mt-3 text-sm text-negative flex gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Com essas taxas e essa margem não fecha a conta. Baixe a margem ou o desconto.
              </p>
            ) : (
              <>
                {avisoFaixa && (
                  <p className="mt-2 text-xs text-negative flex gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {avisoFaixa}
                  </p>
                )}
                <dl key={`m-${res.precoVenda}`} className="destaque-valor mt-4 grid grid-cols-3 gap-2">
                  <Metrica rotulo="Lucro" valor={formatBRL(res.lucroLiquido)} classe={classeValor(res.lucroLiquido)} />
                  <Metrica rotulo="Margem" valor={pct(res.margemEfetivaPct)} dica={DICA_MARGEM} />
                  <Metrica rotulo="Economia" valor={r.precoAvulso > 0 ? pct(r.economiaPct) : "—"} dica="Quanto o cliente economiza em relação a comprar cada item separado." />
                </dl>

                {r.precoAvulso > 0 && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <span className="block text-xs font-medium text-text-secondary">Kit × comprar separado</span>
                    <Barra rotulo="Separado" valor={formatBRL(r.precoAvulso)} fracao={1} tom="neutro" />
                    <Barra rotulo="No kit" valor={formatBRL(res.precoVenda)} fracao={fracaoKit} tom="destaque" />
                    <p className={`text-xs ${classeValor(r.diferencaLucro)}`}>
                      {r.diferencaLucro >= 0
                        ? `Você lucra ${formatBRL(r.diferencaLucro)} a mais que vendendo separado${loja ? " (a tarifa fixa é paga uma vez só)" : ""}.`
                        : `Você lucra ${formatBRL(-r.diferencaLucro)} a menos que vendendo separado: vale se o kit vender mais.`}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border">
                  <span className="block text-xs font-medium text-text-secondary mb-2">Para onde vai o dinheiro</span>
                  <PriceBreakdownChart
                    data={[
                      { nome: "Custo", valor: r.custoKit },
                      { nome: "Taxas e imposto", valor: taxasEImposto },
                      { nome: "Lucro", valor: res.lucroLiquido },
                    ]}
                  />
                </div>
              </>
            )}

            <Button variant="primary" className="w-full mt-5" disabled={!viavel || semCadastro.length > 0} loading={pending} onClick={() => salvar(true)}>
              <PackagePlus size={14} aria-hidden /> Salvar e criar produto
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" disabled={!viavel || pending || semNome} onClick={() => salvar(false)}>
                Só a precificação
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void aba.rasc.salvarRascunho()} loading={aba.rasc.salvando} disabled={!temItens}>
                Salvar rascunho
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button variant="ghost" size="sm" disabled={!viavel} onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDoKit() })}>
                <Copy size={14} aria-hidden /> Copiar
              </Button>
              <Button variant="ghost" size="sm" disabled={!viavel} onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDoKit() })}>
                <MessageCircle size={14} aria-hidden /> WhatsApp
              </Button>
              <Button variant="ghost" size="sm" disabled={!viavel} onClick={() => setPendenteImagem(resumoDoKit())}>
                <ImageIcon size={14} aria-hidden /> Imagem
              </Button>
            </div>
            <div className="mt-2 text-center">
              <IndicadorRascunho sujo={aba.rasc.sujo} salvando={aba.rasc.salvando} salvoEm={aba.rasc.salvoEm} semMigracao={aba.rasc.semMigracao} />
            </div>
            {semCadastro.length > 0 ? (
              <p className="mt-3 text-xs text-text-tertiary">
                {semNome ? "Dê um nome a cada item sem cadastro para salvar. " : ""}
                Para criar o produto kit, cadastre {semCadastro.length === 1 ? "o item sem cadastro" : "os itens sem cadastro"} (o kit baixa o estoque de cada item). Dá para salvar só a precificação agora.
              </p>
            ) : (
              temItens && <p className="mt-3 text-xs text-text-tertiary">O produto kit nasce com os itens na composição: custo = soma deles, estoque = quantos kits dá para montar.</p>
            )}
          </Card>
        </div>

        {/* Celular: barra fixa no rodapé com o preço e o salvar. */}
        {temItens && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-1 shadow-elev-2 px-4 py-2.5 flex items-center gap-3">
            <a href="#resultado-kit" className="min-w-0 flex-1">
              <span className="block font-mono text-lg font-semibold text-text-primary leading-tight">{viavel ? formatBRL(res.precoVenda) : "—"}</span>
              {viavel && (
                <span className="block text-xs text-text-secondary truncate">
                  lucro <span className={classeValor(res.lucroLiquido)}>{formatBRL(res.lucroLiquido)}</span> · {pct(res.margemEfetivaPct)}
                </span>
              )}
            </a>
            <Button variant="primary" disabled={!viavel || pending || semNome} loading={pending} onClick={() => salvar(semCadastro.length === 0)}>
              Salvar
            </Button>
          </div>
        )}
        {modaisExportacao}
      </div>
    </>
  );
}

/** Barra horizontal simples (kit × separado). */
function Barra({ rotulo, valor, fracao, tom }: { rotulo: string; valor: string; fracao: number; tom: "neutro" | "destaque" }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="text-text-secondary">{rotulo}</span>
      <span className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <span className={`block h-full rounded-full transition-[width] duration-[--duracao-media] ${tom === "destaque" ? "bg-accent" : "bg-border-forte"}`} style={{ width: `${Math.round(fracao * 100)}%` }} />
      </span>
      <span className="font-mono text-text-primary">{valor}</span>
    </div>
  );
}

function Rotulo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-text-tertiary">{texto}</span>
      {children}
    </label>
  );
}

/** Uma linha do kit. Item cadastrado: só a quantidade muda. Sem cadastro: tudo é editável. */
function LinhaItem({ item: i, onChange, onRemover }: { item: ItemKit; onChange: (p: Partial<ItemKit>) => void; onRemover: () => void }) {
  const livre = i.produtoId === null;
  const unid = UNIDADES_KIT.find((u) => u.id === (i.unidade ?? "un")) ?? UNIDADES_KIT[0];
  const totalCusto = i.custo * quantidadeEmUnidadeDePreco(i);
  const campo = `${inputClass} h-8 text-right`;
  if (!livre) {
    // Item do cadastro: custo e preço vêm do produto, só a quantidade muda. Uma linha só.
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5 text-sm">
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate font-medium text-text-primary" title={i.nome}>
            {i.nome}
          </div>
          <div className="text-xs text-text-tertiary">
            custo <span className="font-mono">{formatBRL(i.custo)}</span> · avulso <span className="font-mono">{formatBRL(i.preco)}</span>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
          Qtd.
          <span className="block w-16">
          <CampoNumero padrao={1} min={1} casas={0} className={campo} value={i.quantidade} aria-label={`Quantidade de ${i.nome}`} onChange={(n) => onChange({ quantidade: Math.max(1, Math.floor(n)) })} />
          </span>
        </label>
        <div className="w-24 shrink-0 text-right">
          <div className="text-xs text-text-tertiary">no kit</div>
          <div className="font-mono text-sm text-text-primary">{formatBRL(totalCusto)}</div>
        </div>
        <IconButton className="shrink-0" aria-label={`Tirar ${i.nome}`} onClick={onRemover}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    );
  }
  return (
    <div className={`space-y-2 rounded-lg border px-3 py-3 text-sm ${livre ? "border-dashed border-border-forte bg-surface-2/40" : "border-border bg-surface-1"}`}>
      <div className="flex items-center gap-2 min-w-0">
        {livre ? (
          <>
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-secondary">sem cadastro</span>
            <input className={`${inputClass} h-9`} value={i.nome} maxLength={120} aria-label="Nome do item sem cadastro" placeholder="Nome do item (ex.: Farinha de maracujá)" onChange={(e) => onChange({ nome: e.target.value })} />
          </>
        ) : (
          <span className="truncate font-medium text-text-primary" title={i.nome}>
            {i.nome}
          </span>
        )}
        <IconButton className="ml-auto shrink-0" aria-label={`Tirar ${i.nome || "item"}`} onClick={onRemover}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      <div className={`grid ${CAMPOS} items-end gap-2`}>
      <Rotulo texto="Quantidade">
        {livre ? (
          <CampoNumero padrao={1} min={0.001} casas={3} className={campo} value={i.quantidade} aria-label={`Quantidade de ${i.nome || "item"}`} onChange={(n) => onChange({ quantidade: Math.max(0.001, n) })} />
        ) : (
          <CampoNumero padrao={1} min={1} casas={0} className={campo} value={i.quantidade} aria-label={`Quantidade de ${i.nome}`} onChange={(n) => onChange({ quantidade: Math.max(1, Math.floor(n)) })} />
        )}
      </Rotulo>
      <Rotulo texto="Unidade">
        {livre ? (
          <select className={`${inputClass} h-8`} value={i.unidade ?? "un"} aria-label={`Unidade de ${i.nome || "item"}`} onChange={(e) => onChange({ unidade: e.target.value as UnidadeKit })}>
            {UNIDADES_KIT.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-text-secondary h-8 flex items-center">un</span>
        )}
      </Rotulo>
      <Rotulo texto={`Custo (por ${unid.base})`}>
        {livre ? (
          <CampoNumero min={0} casas={4} className={campo} value={i.custo} aria-label={`Custo por ${unid.base} de ${i.nome || "item"}`} placeholder={`R$ por ${unid.base}`} onChange={(n) => onChange({ custo: Math.max(0, n) })} />
        ) : (
          <span className="font-mono text-xs text-text-secondary text-right h-8 flex items-center justify-end">{formatBRL(i.custo)}</span>
        )}
      </Rotulo>
      <Rotulo texto={`Avulso (por ${unid.base})`}>
        {livre ? (
          <CampoNumero min={0} casas={4} className={campo} value={i.preco} aria-label={`Preço avulso por ${unid.base} de ${i.nome || "item"}`} placeholder={`R$ por ${unid.base}`} onChange={(n) => onChange({ preco: Math.max(0, n) })} />
        ) : (
          <span className="font-mono text-xs text-text-secondary text-right h-8 flex items-center justify-end">{formatBRL(i.preco)}</span>
        )}
      </Rotulo>
      <div className="flex flex-col gap-0.5 min-w-0 col-span-2 sm:col-span-1">
        <span className="text-xs text-text-tertiary">No kit</span>
        <span className="font-mono text-xs text-text-primary h-8 flex items-center sm:justify-end">{formatBRL(totalCusto)}</span>
      </div>
      </div>
    </div>
  );
}
