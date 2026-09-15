"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL, precificacoesHistorico } from "@/lib/mock-data";
import {
  resolverPorMargem,
  resolverPorLucro,
  resultadoParaPreco,
  analisarConcorrencia,
  type ComponenteKit,
  type ModoCalculo,
  type Concorrente,
} from "@/lib/pricing";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";

let nextId = 1;
let nextConcorrenteId = 1;

const MODOS: { id: ModoCalculo; label: string }[] = [
  { id: "margem", label: "Margem Alvo" },
  { id: "lucro", label: "Lucro Desejado (R$)" },
  { id: "preco", label: "Preço Fixo" },
];

export default function PrecificacaoPage() {
  const [visao, setVisao] = useState<"individual" | "massa">("individual");
  const [nomeProduto, setNomeProduto] = useState("Kit Cuidados Barba & Couro");
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [impostoPct, setImpostoPct] = useState(6);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);

  const [componentes, setComponentes] = useState<ComponenteKit[]>([
    { id: "c1", nome: "Óleo para Barba 30ml", quantidade: 1, custoUnitario: 8.5 },
    { id: "c2", nome: "Balm Modelador 60g", quantidade: 1, custoUnitario: 11.2 },
    { id: "c3", nome: "Estojo de Couro Rustik", quantidade: 1, custoUnitario: 19.0 },
    { id: "c4", nome: "Caixa Kraft + Embalagem", quantidade: 1, custoUnitario: 2.8 },
  ]);

  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [novoConcorrenteNome, setNovoConcorrenteNome] = useState("");
  const [novoConcorrentePreco, setNovoConcorrentePreco] = useState<number | "">("");

  const custoTotal = componentes.reduce((acc, c) => acc + c.quantidade * c.custoUnitario, 0);

  const taxas = useMemo(
    () => ({
      impostoPct: impostoPct / 100,
      taxaFixa,
      taxaVariavelPct: taxaVariavelPct / 100,
      taxaAdicionalPct: taxaAdicionalPct / 100,
    }),
    [impostoPct, taxaFixa, taxaVariavelPct, taxaAdicionalPct],
  );

  const resultado = useMemo(() => {
    if (modo === "margem") return resolverPorMargem(custoTotal, margemPct / 100, taxas);
    if (modo === "lucro") return resolverPorLucro(custoTotal, lucroDesejado, taxas);
    return resultadoParaPreco(precoFixo, custoTotal, taxas);
  }, [modo, custoTotal, margemPct, lucroDesejado, precoFixo, taxas]);

  function atualizarComponente(id: string, campo: keyof ComponenteKit, valor: string) {
    setComponentes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [campo]: campo === "nome" ? valor : Number(valor) || 0 } : c)),
    );
  }

  function adicionarComponente() {
    nextId += 1;
    setComponentes((prev) => [...prev, { id: `novo-${nextId}`, nome: "Novo insumo", quantidade: 1, custoUnitario: 0 }]);
  }

  function removerComponente(id: string) {
    setComponentes((prev) => prev.filter((c) => c.id !== id));
  }

  const analiseConcorrencia = useMemo(
    () => analisarConcorrencia(resultado, concorrentes, taxas),
    [resultado, concorrentes, taxas],
  );

  function adicionarConcorrente() {
    if (!novoConcorrenteNome.trim() || novoConcorrentePreco === "" || novoConcorrentePreco <= 0) return;
    nextConcorrenteId += 1;
    setConcorrentes((prev) => [
      ...prev,
      { id: `conc${nextConcorrenteId}`, nome: novoConcorrenteNome.trim(), preco: Number(novoConcorrentePreco) },
    ]);
    setNovoConcorrenteNome("");
    setNovoConcorrentePreco("");
  }

  function removerConcorrente(id: string) {
    setConcorrentes((prev) => prev.filter((c) => c.id !== id));
  }

  function textoResumo() {
    return [
      `*${nomeProduto || "Produto"}*`,
      `Preço de venda: ${formatBRL(resultado.precoVenda)}`,
      `Custo: ${formatBRL(resultado.custoTotal)}`,
      `Lucro líquido: ${formatBRL(resultado.lucroLiquido)} (${(resultado.margemEfetivaPct * 100).toFixed(1)}%)`,
    ].join("\n");
  }

  async function copiarPrecificacao() {
    try {
      await navigator.clipboard.writeText(textoResumo());
      toast.success("Precificação copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function enviarWhatsapp() {
    const texto = encodeURIComponent(textoResumo());
    window.open(`https://wa.me/?text=${texto}`, "_blank");
  }

  function salvarPrecificacao() {
    toast.success("Precificação salva no histórico");
  }

  return (
    <>
      <PageHeader eyebrow="Precificação" title="Calculadora de Formação de Preço" />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setVisao("individual")}
          className={`h-9 px-4 rounded-md text-sm border transition-colors ${
            visao === "individual"
              ? "bg-accent-soft border-accent-soft text-accent font-medium"
              : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
          }`}
        >
          Individual
        </button>
        <button
          onClick={() => setVisao("massa")}
          className={`h-9 px-4 rounded-md text-sm border transition-colors ${
            visao === "massa"
              ? "bg-accent-soft border-accent-soft text-accent font-medium"
              : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
          }`}
        >
          Em Massa
        </button>
      </div>

      {visao === "massa" ? (
        <CalculadoraEmMassa />
      ) : (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Produto ou Kit</label>
            <input
              value={nomeProduto}
              onChange={(e) => setNomeProduto(e.target.value)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              placeholder="Nome do produto"
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">Composição de Insumos e Embalagem</h3>
              <button onClick={adicionarComponente} className="text-sm text-accent hover:underline">
                + Adicionar Insumo
              </button>
            </div>
            <Table>
              <Thead>
                <tr>
                  <Th>Componente</Th>
                  <Th align="right">Qtd</Th>
                  <Th align="right">Custo Unit.</Th>
                  <Th align="right">Subtotal</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <tbody>
                {componentes.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <input
                        value={c.nome}
                        onChange={(e) => atualizarComponente(c.id, "nome", e.target.value)}
                        className="w-full bg-transparent text-text-primary outline-none"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={0}
                        value={c.quantidade}
                        onChange={(e) => atualizarComponente(c.id, "quantidade", e.target.value)}
                        className="w-14 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={c.custoUnitario}
                        onChange={(e) => atualizarComponente(c.id, "custoUnitario", e.target.value)}
                        className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(c.quantidade * c.custoUnitario)}
                    </Td>
                    <Td align="right">
                      <button onClick={() => removerComponente(c.id)} className="text-text-tertiary hover:text-negative">
                        ×
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-sm text-text-secondary">Custo Total Direto</span>
              <span className="font-mono text-text-primary font-semibold">{formatBRL(custoTotal)}</span>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-3">Taxas da Plataforma</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
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
            </div>
            <div className="w-full sm:w-1/3">
              <label className="text-xs text-text-secondary mb-1.5 block">Imposto / DAS (%)</label>
              <input
                type="number"
                step="0.1"
                value={impostoPct}
                onChange={(e) => setImpostoPct(Number(e.target.value) || 0)}
                className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
              />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-3">Como calcular o preço</h3>
            <div className="flex gap-2 mb-4">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                    modo === m.id
                      ? "bg-accent-soft border-accent-soft text-accent font-medium"
                      : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {modo === "margem" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Margem Líquida Alvo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={margemPct}
                  onChange={(e) => setMargemPct(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
            {modo === "lucro" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Lucro Líquido Desejado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={lucroDesejado}
                  onChange={(e) => setLucroDesejado(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
            {modo === "preco" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Preço de Venda (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoFixo}
                  onChange={(e) => setPrecoFixo(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-1">Preços dos Concorrentes</h3>
            <p className="text-xs text-text-tertiary mb-3">
              Adicione o preço de anúncios parecidos para receber uma sugestão de posicionamento.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={novoConcorrenteNome}
                onChange={(e) => setNovoConcorrenteNome(e.target.value)}
                placeholder="Loja / anúncio concorrente"
                className="flex-1 h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              />
              <input
                type="number"
                step="0.01"
                value={novoConcorrentePreco}
                onChange={(e) => setNovoConcorrentePreco(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Preço"
                className="w-28 h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-sm text-text-primary outline-none focus:border-accent"
              />
              <Button variant="secondary" onClick={adicionarConcorrente}>
                Adicionar
              </Button>
            </div>
            {concorrentes.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {concorrentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-text-primary">{c.nome}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-secondary">{formatBRL(c.preco)}</span>
                      <button onClick={() => removerConcorrente(c.id)} className="text-text-tertiary hover:text-negative">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-text-tertiary uppercase">Resultado</span>
              <StatusChip label={resultado.viavel ? "Viável" : "Inviável"} tone={resultado.viavel ? "positive" : "negative"} />
            </div>
            <div className="text-center py-4">
              <div className="text-xs text-text-tertiary mb-1">
                {modo === "preco" ? "Preço Informado" : "Preço de Venda Recomendado"}
              </div>
              <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(resultado.precoVenda)}</div>
            </div>

            <div className="pt-4 border-t border-border text-sm space-y-1.5">
              <div className="flex justify-between text-text-secondary">
                <span>Custo</span>
                <span className="font-mono text-text-primary">{formatBRL(resultado.custoTotal)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Taxa variável</span>
                <span className="font-mono text-text-primary">{formatBRL(resultado.taxaVariavelValor)}</span>
              </div>
              {taxaAdicionalPct > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Taxa adicional</span>
                  <span className="font-mono text-text-primary">{formatBRL(resultado.taxaAdicionalValor)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>Imposto</span>
                <span className="font-mono text-text-primary">{formatBRL(resultado.impostoValor)}</span>
              </div>
              <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                <span className="text-text-primary">Lucro líquido</span>
                <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="secondary" className="flex-1" onClick={copiarPrecificacao}>
                Copiar
              </Button>
              <Button variant="primary" className="flex-1" onClick={enviarWhatsapp}>
                Enviar WhatsApp
              </Button>
            </div>
            <Button variant="secondary" className="w-full mt-2" onClick={salvarPrecificacao}>
              Salvar Precificação
            </Button>
          </Card>

          {analiseConcorrencia && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-tertiary uppercase">Estratégia Sugerida</span>
                <StatusChip
                  label={
                    analiseConcorrencia.classificacao === "caro"
                      ? "Acima do mercado"
                      : analiseConcorrencia.classificacao === "barato"
                        ? "Abaixo do mercado"
                        : "Competitivo"
                  }
                  tone={
                    analiseConcorrencia.classificacao === "caro"
                      ? "negative"
                      : analiseConcorrencia.classificacao === "barato"
                        ? "neutral"
                        : "positive"
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <div className="text-xs text-text-tertiary">Média concorrentes</div>
                  <div className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.precoMedioConcorrentes)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-tertiary">Faixa de preços</div>
                  <div className="font-mono text-text-primary">
                    {formatBRL(analiseConcorrencia.precoMinConcorrentes)} – {formatBRL(analiseConcorrencia.precoMaxConcorrentes)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-secondary mb-3">{analiseConcorrencia.sugestao}</p>
              <div className="text-xs text-text-tertiary pt-3 border-t border-border">
                Se vender ao preço médio do mercado, seu lucro líquido seria{" "}
                <span className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.resultadoNoPrecoMedio.lucroLiquido)}</span>{" "}
                ({(analiseConcorrencia.resultadoNoPrecoMedio.margemEfetivaPct * 100).toFixed(1)}%).
              </div>
              <p className="text-[11px] text-text-tertiary italic mt-3">
                Sugestão gerada por regras simples de comparação de preço. Em breve: recomendações mais precisas com IA.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Card className="p-0 overflow-hidden mt-5">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-text-primary">Histórico de Precificações</h2>
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Data</Th>
              <Th>Produto / Kit</Th>
              <Th>Canal</Th>
              <Th align="right">Custo</Th>
              <Th align="right">Preço Venda</Th>
              <Th align="right">Lucro</Th>
              <Th align="right">Margem</Th>
            </tr>
          </Thead>
          <tbody>
            {precificacoesHistorico.map((h, i) => (
              <Tr key={i}>
                <Td mono>{h.data}</Td>
                <Td>{h.produto}</Td>
                <Td>{h.canal}</Td>
                <Td align="right" mono>
                  {formatBRL(h.custo)}
                </Td>
                <Td align="right" mono className="text-accent">
                  {formatBRL(h.preco)}
                </Td>
                <Td align="right" mono>
                  {formatBRL(h.lucro)}
                </Td>
                <Td align="right" mono className="text-positive">
                  +{h.margem.toFixed(1)}%
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      </>
      )}
    </>
  );
}
