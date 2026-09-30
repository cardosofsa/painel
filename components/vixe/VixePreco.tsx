"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { formatarDataIso } from "@/lib/format";
import { analisarPreco, simularPreco, type LojaPreco, type ObjetivoPreco } from "@/lib/vixe/preco";
import type { DiagnosticoPreco } from "@/lib/ia/prompts-preco";
import { pedirDiagnosticoPreco } from "@/app/(painel)/vixe/actions";
import { atualizarPrecoProduto } from "@/app/(painel)/precificacao/actions";
import { NumerosPreco } from "@/components/vixe/NumerosPreco";
import { DiagnosticoVixe } from "@/components/vixe/DiagnosticoVixe";

export interface ProdutoPreco {
  id: string;
  nome: string;
  custo: number;
  preco: number;
  concorrentes: number[];
}

interface RespostaVixe {
  diagnostico: DiagnosticoPreco;
  usadas: number;
  limite: number;
  doCache: boolean;
  origem: "sistema" | "propria";
  provedorRotulo: string | null;
  /** Preço e loja da consulta: se a pessoa mudar os números, a resposta fica velha. */
  chave: string;
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Vixe Preço: escolhe produto e loja, vê os números na hora (sem IA) e, se quiser, pede à
 * Vixe diagnóstico e estratégias. A IA não consulta taxa ao vivo: usa a tabela cadastrada.
 */
export function VixePreco({
  produtos,
  lojas,
  impostoPadraoPct,
  iaDisponivel,
  inicial: pedido,
}: {
  produtos: ProdutoPreco[];
  lojas: LojaPreco[];
  impostoPadraoPct: number;
  iaDisponivel: boolean;
  /** Pré-preenchimento vindo da URL (atalho da Precificação). */
  inicial: { produtoId: string | null; nome: string | null; custo: string | null; preco: string | null; lojaId: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inicial = produtos.find((p) => p.id === pedido.produtoId) ?? null;
  const [produtoId, setProdutoId] = useState<string | null>(inicial?.id ?? null);
  const [nome, setNome] = useState(pedido.nome ?? inicial?.nome ?? "");
  const [custo, setCusto] = useState(pedido.custo ?? (inicial ? String(inicial.custo) : ""));
  const [preco, setPreco] = useState(pedido.preco ?? (inicial ? String(inicial.preco) : ""));
  const [lojaId, setLojaId] = useState<string | null>(pedido.lojaId ?? lojas[0]?.id ?? null);
  const [impostoPct, setImpostoPct] = useState(String(impostoPadraoPct));
  const [objetivo, setObjetivo] = useState<ObjetivoPreco>("margem");
  const [instrucao, setInstrucao] = useState("");
  const [resposta, setResposta] = useState<RespostaVixe | null>(null);

  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  const loja = lojas.find((l) => l.id === lojaId) ?? null;
  const entrada = useMemo(
    () => ({ custo: numero(custo), preco: numero(preco), impostoPct: numero(impostoPct) / 100, loja, concorrentes: produto?.concorrentes ?? [] }),
    [custo, preco, impostoPct, loja, produto],
  );
  const analise = useMemo(() => analisarPreco(entrada), [entrada]);
  const chaveAtual = `${entrada.custo}|${entrada.preco}|${entrada.impostoPct}|${lojaId}|${objetivo}`;
  const respostaVelha = resposta && resposta.chave !== chaveAtual;

  function escolherProduto(id: string) {
    const p = produtos.find((x) => x.id === id) ?? null;
    setProdutoId(p?.id ?? null);
    if (p) {
      setNome(p.nome);
      setCusto(String(p.custo));
      setPreco(String(p.preco));
    }
    setResposta(null);
  }

  function pedir() {
    const r = analise.resultado;
    if (!nome.trim() || !r.viavel) {
      toast.error("Informe produto, custo e preço primeiro.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await executar(
          pedirDiagnosticoPreco({
            produtoNome: nome.trim(),
            canal: loja ? loja.canalNome : null,
            objetivo,
            custo: entrada.custo,
            preco: entrada.preco,
            lucro: r.lucroLiquido,
            margemPct: r.margemEfetivaPct,
            comissaoPct: analise.comissaoAplicadaPct,
            tarifa: analise.tarifaAplicada,
            impostoPct: entrada.impostoPct,
            precoMinimoViavel: analise.precoMinimoViavel,
            zonaMorta: analise.zonaMorta,
            concorrencia: analise.concorrencia
              ? { ...analise.concorrencia, quantidade: entrada.concorrentes.filter((p) => p > 0).length }
              : null,
            precoPsicologico: analise.precoPsicologico,
            instrucaoExtra: instrucao.trim() || null,
          }),
        );
        setResposta({ ...res, chave: chaveAtual });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível falar com a Vixe agora.");
      }
    });
  }

  function salvarNoProduto(novo: number) {
    if (!produtoId) return;
    startTransition(async () => {
      const r = await executarComToast(atualizarPrecoProduto(produtoId, novo), { sucesso: "Preço do produto atualizado", erro: "Erro ao salvar o preço" });
      if (r.ok) {
        setPreco(String(novo));
        router.refresh();
      }
    });
  }

  const rodape = resposta
    ? resposta.origem === "propria"
      ? `Sua IA · ${resposta.provedorRotulo ?? ""}`
      : resposta.limite > 0
        ? `${resposta.usadas}/${resposta.limite} do teste grátis`
        : "IA do sistema"
    : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <Card>
        <h3 className="font-semibold text-text-primary mb-3">O anúncio</h3>
        <FormField label="Produto cadastrado (opcional)">
          <select className={inputClass} value={produtoId ?? ""} onChange={(e) => escolherProduto(e.target.value)}>
            <option value="">Digitar à mão</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </FormField>
        {!produtoId && (
          <FormField label="Nome do produto">
            <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Kit Pincel 12 peças" />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Custo total (R$)">
            <input className={inputClass} inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
          </FormField>
          <FormField label="Preço de venda (R$)">
            <input className={inputClass} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Loja">
            <select className={inputClass} value={lojaId ?? ""} onChange={(e) => setLojaId(e.target.value || null)}>
              <option value="">Sem plataforma</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.canalNome} — {l.nome}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Imposto (%)">
            <input className={inputClass} inputMode="decimal" value={impostoPct} onChange={(e) => setImpostoPct(e.target.value)} />
          </FormField>
        </div>
        <p className="text-xs text-text-tertiary -mt-1 mb-3">
          {loja
            ? `A Vixe não consulta taxa ao vivo: usa as taxas cadastradas de ${loja.canalNome}${
                loja.faixasAtualizadasEm ? ` (tabela de faixas gravada em ${formatarDataIso(loja.faixasAtualizadasEm.slice(0, 10))})` : ""
              }. Confira na plataforma se mudou.`
            : "Sem loja, a conta não desconta comissão de plataforma."}
        </p>

        <div className="border-t border-border pt-3">
          <h4 className="text-sm font-medium text-text-primary mb-3">Números agora</h4>
          <NumerosPreco analise={analise} onUsarPreco={(p) => setPreco(String(p))} />
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-text-primary mb-1">Pergunte à Vixe</h3>
        <p className="text-xs text-text-tertiary mb-3">Ela lê os números ao lado e diz o que fazer com o preço.</p>
        <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Objetivo">
          {(
            [
              ["margem", "Ganhar mais por venda"],
              ["volume", "Vender mais"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              role="radio"
              aria-checked={objetivo === v}
              onClick={() => setObjetivo(v)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${objetivo === v ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <FormField label="Algo a considerar? (opcional)">
          <input
            className={inputClass}
            value={instrucao}
            maxLength={300}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Ex: produto novo, ainda sem avaliações"
          />
        </FormField>
        {iaDisponivel ? (
          <Button variant="primary" className="w-full" loading={pending && !resposta} onClick={pedir}>
            <Sparkles size={14} /> {resposta ? "Perguntar de novo" : "Pedir análise à Vixe"}
          </Button>
        ) : (
          <p className="text-sm text-text-secondary">
            Nenhuma IA disponível para a sua conta. Cadastre a sua em Configurações → IA. Os números ao lado continuam valendo.
          </p>
        )}

        {resposta && (
          <div className="mt-4 border-t border-border pt-4">
            {respostaVelha && (
              <p className="text-xs text-negative mb-3">Os números mudaram desde esta análise. Pergunte de novo para atualizar.</p>
            )}
            <DiagnosticoVixe
              diagnostico={resposta.diagnostico}
              simulado={resposta.diagnostico.precoSugerido != null ? simularPreco(entrada, resposta.diagnostico.precoSugerido) : null}
              atual={analise.resultado}
              rodape={rodape}
              doCache={resposta.doCache}
              podeSalvar={!!produtoId}
              salvando={pending}
              onTestar={(p) => setPreco(String(p))}
              onSalvar={salvarNoProduto}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
