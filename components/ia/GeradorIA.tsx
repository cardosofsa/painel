"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Copy, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { executar, type Resultado } from "@/lib/acao";
import { TONS, type Tom } from "@/lib/ia/prompts";
import { OpcaoSugestao } from "@/components/ia/OpcaoSugestao";

export interface SugestaoIAUI {
  texto: string;
  /** Título: até 3 opções. Ausente (resposta antiga) = só `texto`. */
  opcoes?: string[];
  palavrasChave: string[];
  posicionamento: string | null;
  usadas: number;
  limite: number;
  doCache: boolean;
  /** Qual IA atendeu. Ausente = IA do sistema. */
  origem?: "sistema" | "propria";
  provedorRotulo?: string | null;
}

interface Props {
  /** Texto do botão. Ex.: "Gerar título com IA". */
  rotulo: string;
  /** Título ganha nota local por opção; descrição mostra o texto com as seções. */
  tipo: "titulo" | "descricao";
  /**
   * Closure montada pelo consumidor: é ela que carrega o contexto do produto.
   *
   * Devolve `Resultado` como toda action do app — exceção de Server Action é redigida
   * pelo Next em produção e a mensagem em pt-BR não chegaria aqui. Ver `lib/acao.ts`.
   */
  gerar: (instrucaoExtra: string | null, tom: Tom) => Promise<Resultado<SugestaoIAUI>>;
  onUsar: (texto: string) => void;
  /** Recebe as palavras-chave da sugestão, para quem quiser guardá-las (ex.: no produto). */
  onPalavrasChave?: (termos: string[]) => void;
  /** Limite do campo de destino — o do canal, quando houver. */
  limite: number;
  /** O que será sobrescrito. Não vazio → pede confirmação antes de aplicar. */
  valorAtual: string;
  /** Termo que o comprador buscaria, para a nota do título quando a IA não der palavra-chave. */
  termoPrincipal?: string | null;
  /** `false` quando não há IA disponível para a conta. */
  disponivel: boolean;
  desabilitado?: boolean;
  motivoDesabilitado?: string;
}

/**
 * Painel de geração por IA, compartilhado pela precificação (título e descrição do
 * anúncio) e por produtos (descrição).
 *
 * Duas decisões que valem explicação:
 *
 * 1. **Painel inline, nunca `Modal`.** Em produtos este componente vive DENTRO do modal de
 *    cadastro; abrir outro modal por cima seria modal aninhado. Pelo mesmo motivo a
 *    confirmação de sobrescrita é feita aqui dentro, em dois cliques, em vez de usar o
 *    `useConfirm()` (que renderiza um `Modal`).
 *
 * 2. **Nenhum `useEffect`.** Todo `setState` sai de handler de evento, então a regra
 *    `react-hooks/set-state-in-effect` não é tocada. Para zerar a sugestão ao trocar de
 *    produto, o consumidor passa `key` neste componente — é aqui que o `useState` mora.
 */
export function GeradorIA({
  rotulo,
  tipo,
  gerar,
  onUsar,
  onPalavrasChave,
  limite,
  valorAtual,
  termoPrincipal = null,
  disponivel,
  desabilitado = false,
  motivoDesabilitado,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [sugestao, setSugestao] = useState<SugestaoIAUI | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [tom, setTom] = useState<Tom>("padrao");
  /** Texto escolhido esperando confirmação de sobrescrita. */
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Sem IA disponível para a conta, não há botão nenhum.
  if (!disponivel) return null;

  const opcoes = sugestao ? (sugestao.opcoes?.length ? sugestao.opcoes : [sugestao.texto]) : [];

  function disparar() {
    setConfirmando(null);
    startTransition(async () => {
      try {
        // `executar` relança a mensagem traduzida para o catch abaixo.
        setSugestao(await executar(gerar(instrucao.trim() || null, tom)));
        setCopiado(false);
      } catch (e) {
        // Sobra só falha de transporte (rede caiu, sessão morreu no meio).
        toast.error(e instanceof Error ? e.message : "Não foi possível gerar agora.");
      }
    });
  }

  function aplicar(texto: string, confirmado = false) {
    // Sobrescrever texto que a pessoa escreveu à mão é destrutivo: confirma primeiro.
    if (valorAtual.trim() && valorAtual.trim() !== texto.trim() && !confirmado) {
      setConfirmando(texto);
      return;
    }
    onUsar(texto);
    if (sugestao?.palavrasChave.length) onPalavrasChave?.(sugestao.palavrasChave);
    setSugestao(null);
    setConfirmando(null);
    toast.success("Texto aplicado. Salve para gravar.");
  }

  async function copiarPalavras() {
    if (!sugestao?.palavrasChave.length) return;
    try {
      await navigator.clipboard.writeText(sugestao.palavrasChave.join(", "));
      setCopiado(true);
      toast.success("Palavras-chave copiadas");
    } catch {
      toast.error("Seu navegador bloqueou a cópia. Selecione e copie à mão.");
    }
  }

  const seletorTom = (
    <select
      value={tom}
      onChange={(e) => setTom(e.target.value as Tom)}
      className={`${inputClass} w-auto h-9`}
      aria-label="Tom do texto"
      title="Tom do texto"
    >
      {(Object.keys(TONS) as Tom[]).map((t) => (
        <option key={t} value={t}>
          Tom: {TONS[t].rotulo}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          loading={pending && !sugestao}
          disabled={desabilitado}
          title={desabilitado ? motivoDesabilitado : undefined}
          onClick={disparar}
        >
          <Sparkles size={14} /> {rotulo}
        </Button>
        {!sugestao && !desabilitado && seletorTom}
      </div>
      {desabilitado && motivoDesabilitado && <p className="text-xs text-text-tertiary mt-1.5">{motivoDesabilitado}</p>}

      {sugestao && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3.5 space-y-3">
          <span className="block text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {opcoes.length > 1 ? "Opções da IA" : "Sugestão da IA"}
          </span>

          {confirmando !== null ? (
            <div className="rounded-md border border-border bg-surface-1 p-2.5">
              <p className="text-sm text-text-primary mb-2">Isso vai substituir o texto que já está no campo.</p>
              <div className="flex gap-2">
                <Button type="button" variant="primary" onClick={() => aplicar(confirmando, true)}>
                  Substituir
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {opcoes.map((op) => (
                <OpcaoSugestao
                  key={op}
                  texto={op}
                  limite={limite}
                  titulo={tipo === "titulo"}
                  termoPrincipal={sugestao.palavrasChave[0] ?? termoPrincipal}
                  onUsar={() => aplicar(op)}
                />
              ))}
            </div>
          )}

          {sugestao.posicionamento && (
            <div className="border-t border-border pt-2.5">
              <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1">
                Como se diferenciar dos concorrentes
              </div>
              <p className="text-sm text-text-secondary">{sugestao.posicionamento}</p>
            </div>
          )}

          {sugestao.palavrasChave.length > 0 && (
            <div className="border-t border-border pt-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Palavras-chave</span>
                <button type="button" onClick={copiarPalavras} className="flex items-center gap-1 text-xs text-accent hover:underline">
                  {copiado ? <Check size={12} /> : <Copy size={12} />} Copiar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sugestao.palavrasChave.map((termo) => (
                  <span key={termo} className="px-2 py-0.5 rounded bg-accent-soft text-accent text-xs">
                    {termo}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-2.5">
            <label className="block text-xs text-text-tertiary mb-1">Quer ajustar? Diga o que mudar</label>
            <input
              className={inputClass}
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              placeholder="Ex: foque em público fitness, destaque que é kit com 3"
              maxLength={300}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {seletorTom}
            <Button type="button" variant="secondary" loading={pending} onClick={disparar}>
              <RefreshCw size={14} /> Gerar de novo
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSugestao(null)}>
              <X size={14} /> Descartar
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-text-tertiary">
            {/* O texto vai para a vitrine pública — quem publica responde por ele. */}
            <span>Revise antes de publicar: a IA pode errar detalhe do produto.</span>
            <span className="shrink-0 flex items-center gap-1">
              {sugestao.doCache && (
                <span className="flex items-center gap-1 text-accent" title="Já tinha sido gerado antes: não consumiu cota">
                  <Zap size={11} /> cache
                </span>
              )}
              {sugestao.origem === "propria"
                ? `Sua IA · ${sugestao.provedorRotulo ?? ""}`
                : sugestao.limite > 0
                  ? `${sugestao.usadas}/${sugestao.limite} do teste grátis`
                  : "IA do sistema"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
