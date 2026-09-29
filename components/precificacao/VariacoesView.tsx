"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL, numeroOuNulo, formatarMargemPct, classeValor } from "@/lib/format";
import {
  resolverPorMargem,
  resolverPorLucro,
  resultadoParaPreco,
  resolverComFaixas,
  MODOS,
  type ModoCalculo,
  type TaxasPlataforma,
} from "@/lib/pricing";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import {
  type ResumoExport,
  DetalhamentoPrecificacao,
  useExportarPrecificacao,
  SimuladorPreco,
} from "@/components/precificacao/resultado-compartilhado";
import { criarAnuncio, removerAnuncio, gerarTituloAnuncioIA, type VariacaoInput } from "@/app/(painel)/precificacao/actions";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { LIMITE_TITULO } from "@/lib/ia/prompts";
import type { ProdutoOpcao, LojaOpcao, AnuncioSalvo } from "@/lib/precificacao-estado";
import { executarComToast } from "@/lib/acao-cliente";
import { inputClass } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";

export function VariacoesView({
  produtos,
  lojas,
  anuncios,
  aliquotaDasPadrao,
  confirm,
  setVisao,
  exportarAnunciosCsv,
  iaDisponivel,
}: {
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  aliquotaDasPadrao: number;
  /** Vem do servidor via PrecificacaoClient: `GEMINI_API_KEY` não é lida no cliente. */
  iaDisponivel: boolean;
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  setVisao: (visao: "individual" | "variacoes" | "massa" | "historico") => void;
  exportarAnunciosCsv: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [tituloAnuncio, setTituloAnuncio] = useState("");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [modoTaxas, setModoTaxas] = useState<"manual" | "loja">("manual");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [custoUnitarioBase, setCustoUnitarioBase] = useState(10);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);
  const [impostoPct, setImpostoPct] = useState(aliquotaDasPadrao);
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [anuncioExpandido, setAnuncioExpandido] = useState<string | null>(null);
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao();

  interface VariacaoLinha {
    id: string;
    nome: string;
    multiplicador: number;
    custoManual: number | null;
    parametroOverride: number | null;
  }
  const [variacoes, setVariacoes] = useState<VariacaoLinha[]>([
    { id: "v1", nome: "Unidade", multiplicador: 1, custoManual: null, parametroOverride: null },
    { id: "v2", nome: "Kit 2", multiplicador: 2, custoManual: null, parametroOverride: null },
    { id: "v3", nome: "Kit 3", multiplicador: 3, custoManual: null, parametroOverride: null },
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- override de parâmetro só faz sentido dentro do modo em que foi digitado
    setVariacoes((prev) => prev.map((v) => ({ ...v, parametroOverride: null })));
  }, [modo]);

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);
  const canaisAgrupados = useMemo(() => Array.from(new Set(lojas.map((l) => l.canalNome))), [lojas]);
  const parametroPadrao = modo === "margem" ? margemPct : modo === "lucro" ? lucroDesejado : precoFixo;

  function taxasEfetivas(): TaxasPlataforma {
    if (modoTaxas === "loja" && lojaSelecionada && lojaSelecionada.tipoTaxa === "fixo") {
      return {
        impostoPct: impostoPct / 100,
        taxaFixa: lojaSelecionada.taxaFixa,
        taxaVariavelPct: lojaSelecionada.comissaoPct / 100,
        taxaAdicionalPct: taxaAdicionalPct / 100,
        taxaExtraValor: lojaSelecionada.taxaExtraValor ?? undefined,
        taxaExtraTipo: lojaSelecionada.taxaExtraTipo,
      };
    }
    return {
      impostoPct: impostoPct / 100,
      taxaFixa,
      taxaVariavelPct: taxaVariavelPct / 100,
      taxaAdicionalPct: taxaAdicionalPct / 100,
    };
  }

  function calcularVariacao(v: VariacaoLinha) {
    const custo = v.custoManual ?? custoUnitarioBase * v.multiplicador;
    const parametroBruto = v.parametroOverride ?? parametroPadrao;
    const parametro = modo === "margem" ? parametroBruto / 100 : parametroBruto;
    if (modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas") {
      const { resultado } = resolverComFaixas(
        custo,
        modo,
        parametro,
        {
          impostoPct: impostoPct / 100,
          taxaAdicionalPct: taxaAdicionalPct / 100,
          taxaExtraValor: lojaSelecionada.taxaExtraValor ?? undefined,
          taxaExtraTipo: lojaSelecionada.taxaExtraTipo,
        },
        lojaSelecionada.faixas,
      );
      return { custo, resultado };
    }
    const taxas = taxasEfetivas();
    const resultado =
      modo === "margem"
        ? resolverPorMargem(custo, parametro, taxas)
        : modo === "lucro"
          ? resolverPorLucro(custo, parametro, taxas)
          : resultadoParaPreco(parametro, custo, taxas);
    return { custo, resultado };
  }

  function adicionarVariacao() {
    setVariacoes((prev) => [
      ...prev,
      { id: `v${Date.now()}`, nome: `Kit ${prev.length + 1}`, multiplicador: prev.length + 1, custoManual: null, parametroOverride: null },
    ]);
  }

  function removerVariacao(id: string) {
    setVariacoes((prev) => prev.filter((v) => v.id !== id));
  }

  function atualizarVariacao(id: string, campo: keyof VariacaoLinha, valor: string) {
    setVariacoes((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        if (campo === "nome") return { ...v, nome: valor };
        // `Number("1,50")` — o usuário digitando no formato brasileiro — devolve NaN, e o
        // `??` lá na frente não pega NaN: ele atravessava o cálculo inteiro e só estourava
        // no INSERT. `numeroOuNulo` converte vírgula e recusa qualquer coisa não finita.
        if (campo === "multiplicador") return { ...v, multiplicador: numeroOuNulo(valor) ?? 1 };
        if (campo === "parametroOverride") return { ...v, parametroOverride: numeroOuNulo(valor) };
        return { ...v, custoManual: numeroOuNulo(valor) };
      }),
    );
  }

  function resumoDeVariacao(v: VariacaoLinha): ResumoExport {
    const { custo, resultado } = calcularVariacao(v);
    const taxas = taxasEfetivas();
    const emFaixas = modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas";
    const taxaVariavelPct = emFaixas
      ? resultado.precoVenda > 0
        ? resultado.taxaVariavelValor / resultado.precoVenda
        : 0
      : taxas.taxaVariavelPct;
    const taxaFixa = emFaixas
      ? Math.max(0, resultado.precoVenda - custo - resultado.lucroLiquido - resultado.taxaVariavelValor - resultado.impostoValor)
      : taxas.taxaFixa;
    return {
      titulo: `${nomeAnuncio.trim() || "Anúncio"} — ${v.nome}`,
      precoVenda: resultado.precoVenda,
      custoTotal: resultado.custoTotal,
      taxaVariavelValor: resultado.taxaVariavelValor,
      taxaVariavelPct,
      taxaFixa,
      taxaAdicionalValor: resultado.taxaAdicionalValor,
      taxaAdicionalPct: taxaAdicionalPct / 100,
      impostoValor: resultado.impostoValor,
      impostoPct: impostoPct / 100,
      taxaExtraCalculada: resultado.taxaExtraCalculada,
      lucroLiquido: resultado.lucroLiquido,
      margemEfetivaPct: resultado.margemEfetivaPct,
      componentes: null,
      faixaVenda: null,
    };
  }

  function salvarAnuncio() {
    if (!nomeAnuncio.trim() || custoUnitarioBase <= 0 || variacoes.length === 0) {
      toast.error("Preencha o nome do anúncio, o custo unitário base e adicione ao menos uma variação");
      return;
    }
    const variacoesInput: VariacaoInput[] = variacoes.map((v) => {
      const { custo, resultado } = calcularVariacao(v);
      const taxas = taxasEfetivas();
      const taxaVariavelPctFinal =
        modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas"
          ? resultado.taxaVariavelValor / (resultado.precoVenda || 1)
          : taxas.taxaVariavelPct;
      const taxaFixaFinal = modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas" ? resultado.precoVenda - custo - resultado.lucroLiquido - resultado.taxaVariavelValor - resultado.impostoValor : taxas.taxaFixa;
      return {
        nome_variacao: v.nome,
        multiplicador: v.multiplicador,
        custo,
        taxa_variavel_pct: taxaVariavelPctFinal,
        taxa_fixa: Math.max(0, taxaFixaFinal),
        taxa_adicional_pct: taxaAdicionalPct / 100,
        imposto_pct: impostoPct / 100,
        taxa_extra_valor: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraValor ?? null) : null,
        taxa_extra_tipo: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraTipo ?? null) : null,
        margem_pct: resultado.margemEfetivaPct,
        preco_calculado: resultado.precoVenda,
        lucro: resultado.lucroLiquido,
      };
    });

    startTransition(async () => {
      const r = await executarComToast(criarAnuncio({
          produto_id: produtoId,
          loja_id: modoTaxas === "loja" ? lojaId : null,
          nome_anuncio: nomeAnuncio,
          titulo_anuncio: tituloAnuncio.trim() || null,
          componentes_base: [{ id: "base", nome: "Custo unitário base", quantidade: 1, custoUnitario: custoUnitarioBase }],
          variacoes: variacoesInput,
        }), { sucesso: "Anúncio com variações salvo", erro: "Erro ao salvar anúncio" });
      if (r.ok) {
        setNomeAnuncio("");
        setTituloAnuncio("");
      }
    });
  }

  async function excluirAnuncio(a: AnuncioSalvo) {
    const ok = await confirm({ title: "Remover anúncio?", message: `"${a.nome_anuncio}" e suas variações serão removidas definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerAnuncio(a.id), { sucesso: "Anúncio removido", erro: "Erro ao remover anúncio" });
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">Produto com Variações</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Nome do Anúncio <span className="text-negative">*</span>
            </label>
            <input
              value={nomeAnuncio}
              onChange={(e) => setNomeAnuncio(e.target.value)}
              placeholder="Ex: Óleo para Barba"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Título do Anúncio (opcional)</label>
            <input
              value={tituloAnuncio}
              onChange={(e) => setTituloAnuncio(e.target.value)}
              className={inputClass}
            />
            <GeradorIA
              key={`ia-titulo-var-${produtoId ?? nomeAnuncio}`}
              rotulo="Gerar título com IA"
              limite={LIMITE_TITULO}
              valorAtual={tituloAnuncio}
              disponivel={iaDisponivel}
              desabilitado={!nomeAnuncio.trim()}
              motivoDesabilitado={!nomeAnuncio.trim() ? "Preencha o nome do anúncio primeiro." : undefined}
              gerar={(instrucaoExtra) =>
                gerarTituloAnuncioIA({
                  produtoNome: nomeAnuncio,
                  sku: produtos.find((p) => p.id === produtoId)?.sku ?? null,
                  canal: lojaSelecionada?.canalNome ?? null,
                  loja: lojaSelecionada?.nome ?? null,
                  custo: custoUnitarioBase,
                  // A variação entra como "itens que acompanham": é o que diferencia este
                  // anúncio de um produto simples.
                  componentes: variacoes.filter((v) => v.nome.trim()).map((v) => ({ nome: v.nome, quantidade: 1 })),
                  instrucaoExtra,
                })
              }
              onUsar={setTituloAnuncio}
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1.5 block">Vincular Produto (opcional)</label>
          <select
            value={produtoId ?? ""}
            onChange={(e) => setProdutoId(e.target.value || null)}
            className={inputClass}
          >
            <option value="">Nenhum</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1.5 block">Como calcular o preço (padrão pra variações sem override)</label>
          <div className="flex gap-2 flex-wrap">
            {MODOS.map((m) => (
              <Chip key={m.id} onClick={() => setModo(m.id)} ativo={modo === m.id}>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Custo Unitário Base (R$) <span className="text-negative">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={custoUnitarioBase}
              onChange={(e) => setCustoUnitarioBase(Number(e.target.value) || 0)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              {modo === "margem" ? "Margem Líquida Alvo (%)" : modo === "lucro" ? "Lucro Líquido Desejado (R$)" : "Preço de Venda (R$)"}
            </label>
            <input
              type="number"
              step={modo === "margem" ? "0.1" : "0.01"}
              value={parametroPadrao}
              onChange={(e) => {
                const valor = Number(e.target.value) || 0;
                if (modo === "margem") setMargemPct(valor);
                else if (modo === "lucro") setLucroDesejado(valor);
                else setPrecoFixo(valor);
              }}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Taxa Adicional (%)</label>
            <input
              type="number"
              step="0.1"
              value={taxaAdicionalPct}
              onChange={(e) => setTaxaAdicionalPct(Number(e.target.value) || 0)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Imposto / DAS (%)</label>
            <input
              type="number"
              step="0.1"
              value={impostoPct}
              onChange={(e) => setImpostoPct(Number(e.target.value) || 0)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <Chip onClick={() => setModoTaxas("manual")} ativo={modoTaxas === "manual"}>
            Manual
          </Chip>
          <Chip onClick={() => setModoTaxas("loja")} ativo={modoTaxas === "loja"}>
            Selecionar Loja
          </Chip>
        </div>

        {modoTaxas === "manual" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Taxa Fixa (R$)</label>
              <input
                type="number"
                step="0.01"
                value={taxaFixa}
                onChange={(e) => setTaxaFixa(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Taxa Variável (%)</label>
              <input
                type="number"
                step="0.1"
                value={taxaVariavelPct}
                onChange={(e) => setTaxaVariavelPct(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        ) : (
          <select
            value={lojaId ?? ""}
            onChange={(e) => setLojaId(e.target.value || null)}
            className={inputClass}
          >
            <option value="">Selecione…</option>
            {canaisAgrupados.map((canalNome) => (
              <optgroup label={canalNome} key={canalNome}>
                {lojas
                  .filter((l) => l.canalNome === canalNome)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </Card>

      <Card padding="nenhum" className="overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Variações</h3>
          <button onClick={adicionarVariacao} className="text-sm text-accent hover:underline">
            + Adicionar Variação
          </button>
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Nome</Th>
              <Th align="right">Multiplicador</Th>
              <Th align="right">Custo (R$)</Th>
              <Th align="right">{modo === "margem" ? "Margem %" : modo === "lucro" ? "Lucro (R$)" : "Preço (R$)"}</Th>
              <Th align="right">Preço Sugerido</Th>
              <Th align="right">Lucro</Th>
              <Th align="right">Margem</Th>
              <Th></Th>
              <Th></Th>
            </tr>
          </Thead>
          <tbody>
            {variacoes.map((v) => {
              const { custo, resultado } = calcularVariacao(v);
              const expandida = linhaExpandida === v.id;
              return (
                <Fragment key={v.id}>
                  <Tr>
                    <Td>
                      <input
                        value={v.nome}
                        onChange={(e) => atualizarVariacao(v.id, "nome", e.target.value)}
                        className="w-full bg-transparent text-text-primary outline-none"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={1}
                        value={v.multiplicador}
                        onChange={(e) => atualizarVariacao(v.id, "multiplicador", e.target.value)}
                        className="w-14 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        step="0.01"
                        value={v.custoManual ?? custo}
                        onChange={(e) => atualizarVariacao(v.id, "custoManual", e.target.value)}
                        className="w-24 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        step={modo === "margem" ? "0.1" : "0.01"}
                        value={v.parametroOverride ?? parametroPadrao}
                        onChange={(e) => atualizarVariacao(v.id, "parametroOverride", e.target.value)}
                        className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right" mono className="text-accent">
                      {formatBRL(resultado.precoVenda)}
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(resultado.lucroLiquido)}
                    </Td>
                    <Td align="right" mono className={classeValor(resultado.lucroLiquido)}>
                      {formatarMargemPct(resultado.lucroLiquido, resultado.precoVenda)}
                    </Td>
                    <Td align="right">
                      <button
                        onClick={() => setLinhaExpandida(expandida ? null : v.id)}
                        className="text-text-tertiary hover:text-text-primary"
                      >
                        {expandida ? "▲" : "▾"}
                      </button>
                    </Td>
                    <Td align="right">
                      <button onClick={() => removerVariacao(v.id)} className="text-text-tertiary hover:text-negative">
                        ×
                      </button>
                    </Td>
                  </Tr>
                  {expandida && (
                    <tr>
                      <td colSpan={9} className="bg-surface-2/40 px-5 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          <Card className={resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-medium text-text-tertiary uppercase">Resultado — {v.nome}</span>
                              <StatusChip label={resultado.viavel ? "Viável" : "Inviável"} tone={resultado.viavel ? "positive" : "negative"} />
                            </div>
                            <div className="text-center py-4">
                              <div className="text-xs text-text-tertiary mb-1">Preço de Venda Recomendado</div>
                              <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(resultado.precoVenda)}</div>
                            </div>
                            <div className="pt-4 border-t border-border text-sm space-y-1.5">
                              <DetalhamentoPrecificacao
                                aberto
                                onToggle={() => {}}
                                componentes={null}
                                custoTotal={resultado.custoTotal}
                                taxaVariavelValor={resultado.taxaVariavelValor}
                                taxaVariavelPct={taxasEfetivas().taxaVariavelPct}
                                taxaFixa={taxasEfetivas().taxaFixa}
                                taxaAdicionalValor={resultado.taxaAdicionalValor}
                                taxaAdicionalPct={taxaAdicionalPct / 100}
                                taxaExtraCalculada={resultado.taxaExtraCalculada}
                                impostoValor={resultado.impostoValor}
                                impostoPct={impostoPct / 100}
                              />
                              <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                                <span className="text-text-primary">Lucro líquido</span>
                                <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                                  {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="flex justify-between text-text-tertiary text-xs">
                                <span>Margem sobre custo</span>
                                <span className="font-mono">{(resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="mt-3">
                              <SimuladorPreco
                                custoTotal={resultado.custoTotal}
                                taxas={{
                                  impostoPct: impostoPct / 100,
                                  taxaFixa: taxasEfetivas().taxaFixa,
                                  taxaVariavelPct: taxasEfetivas().taxaVariavelPct,
                                  taxaAdicionalPct: taxaAdicionalPct / 100,
                                  taxaExtraValor: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraValor ?? undefined) : undefined,
                                  taxaExtraTipo: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraTipo ?? null) : null,
                                }}
                              />
                            </div>
                            <div className="flex gap-2 mt-4">
                              <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDeVariacao(v) })}
                              >
                                Copiar
                              </Button>
                              <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDeVariacao(v) })}
                              >
                                Enviar WhatsApp
                              </Button>
                            </div>
                            <Button
                              variant="secondary"
                              className="w-full mt-2"
                              onClick={() => setPendenteImagem(resumoDeVariacao(v))}
                            >
                              Imagem
                            </Button>
                          </Card>
                          <Card>
                            <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
                            <PriceBreakdownChart
                              data={[
                                { nome: "Custo", valor: resultado.custoTotal },
                                {
                                  nome: "Taxas da plataforma",
                                  valor: taxasEfetivas().taxaFixa + resultado.taxaVariavelValor + resultado.taxaAdicionalValor + resultado.taxaExtraCalculada,
                                },
                                { nome: "Imposto", valor: resultado.impostoValor },
                                { nome: "Lucro líquido", valor: Math.max(0, resultado.lucroLiquido) },
                              ]}
                            />
                          </Card>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
        <div className="p-4 border-t border-border">
          <Button
            variant="primary"
            onClick={salvarAnuncio}
            loading={pending}
            disabled={!nomeAnuncio.trim() || custoUnitarioBase <= 0 || variacoes.length === 0}
          >
            Salvar Anúncio
          </Button>
        </div>
      </Card>

      <Card padding="nenhum" className="overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Variações Salvas</h2>
          <div className="flex items-center gap-3">
            <button onClick={exportarAnunciosCsv} className="text-xs text-accent hover:underline">
              Exportar CSV
            </button>
            <button onClick={() => setVisao("historico")} className="text-xs text-accent hover:underline">
              Ver histórico completo →
            </button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {anuncios.slice(0, 5).map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setAnuncioExpandido((v) => (v === a.id ? null : a.id))}
                  className="text-sm font-medium text-text-primary hover:text-accent text-left"
                >
                  {a.nome_anuncio}{" "}
                  <span className="text-text-tertiary font-normal">
                    ({a.variacoes.length} variações · {new Date(a.criado_em).toLocaleDateString("pt-BR")})
                  </span>
                </button>
                <button onClick={() => excluirAnuncio(a)} className="text-xs text-negative hover:underline shrink-0">
                  Remover
                </button>
              </div>
              {anuncioExpandido === a.id && (
                <div className="mt-3 border border-border rounded-md divide-y divide-border">
                  {a.variacoes.map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-text-primary">{v.nome_variacao}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-text-secondary">custo {formatBRL(v.custo)}</span>
                        <span className="font-mono text-accent">{formatBRL(v.preco_calculado)}</span>
                        <span className={`font-mono ${classeValor(v.lucro)}`}>
                          {formatarMargemPct(v.lucro, v.preco_calculado)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {anuncios.length === 0 && (
            <p className="text-sm text-text-tertiary text-center py-8">Nenhum produto com variações salvo ainda.</p>
          )}
        </div>
      </Card>

      {modaisExportacao}
    </div>
  );
}
