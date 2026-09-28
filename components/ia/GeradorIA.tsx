"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Copy, Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { executar, type Resultado } from "@/lib/acao";

export interface SugestaoIAUI {
  texto: string;
  palavrasChave: string[];
  posicionamento: string | null;
  usadas: number;
  limite: number;
  doCache: boolean;
}

interface Props {
  /** Texto do botão. Ex.: "Gerar título com IA". */
  rotulo: string;
  /**
   * Closure montada pelo consumidor: é ela que carrega o contexto do produto.
   *
   * Devolve `Resultado` como toda action do app — exceção de Server Action é redigida
   * pelo Next em produção e a mensagem em pt-BR não chegaria aqui. Ver `lib/acao.ts`.
   */
  gerar: (instrucaoExtra: string | null) => Promise<Resultado<SugestaoIAUI>>;
  onUsar: (texto: string) => void;
  /** Teto do campo de destino, só para o contador visual. */
  limite: number;
  /** O que será sobrescrito. Não vazio → pede confirmação antes de aplicar. */
  valorAtual: string;
  /** `false` quando o sistema não tem chave de IA configurada. */
  disponivel: boolean;
  desabilitado?: boolean;
  motivoDesabilitado?: string;
}

/**
 * Painel de geração por IA, compartilhado pela precificação (título) e por produtos
 * (descrição).
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
  gerar,
  onUsar,
  limite,
  valorAtual,
  disponivel,
  desabilitado = false,
  motivoDesabilitado,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [sugestao, setSugestao] = useState<SugestaoIAUI | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Quem não configurou a chave não vê botão nenhum.
  if (!disponivel) return null;

  function disparar() {
    setConfirmando(false);
    startTransition(async () => {
      try {
        // `executar` relança a mensagem traduzida para o catch abaixo.
        setSugestao(await executar(gerar(instrucao.trim() || null)));
      } catch (e) {
        // Sobra só falha de transporte (rede caiu, sessão morreu no meio).
        toast.error(e instanceof Error ? e.message : "Não foi possível gerar agora.");
      }
    });
  }

  function aplicar() {
    if (!sugestao) return;
    // Sobrescrever texto que a pessoa escreveu à mão é destrutivo: confirma primeiro.
    if (valorAtual.trim() && !confirmando) {
      setConfirmando(true);
      return;
    }
    onUsar(sugestao.texto);
    setSugestao(null);
    setConfirmando(false);
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

  return (
    <div className="mt-2">
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
      {desabilitado && motivoDesabilitado && (
        <p className="text-xs text-text-tertiary mt-1.5">{motivoDesabilitado}</p>
      )}

      {sugestao && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Sugestão da IA</span>
            <span className={`text-xs font-mono shrink-0 ${sugestao.texto.length > limite ? "text-negative" : "text-text-tertiary"}`}>
              {sugestao.texto.length}/{limite}
            </span>
          </div>

          <p className="text-sm text-text-primary whitespace-pre-wrap">{sugestao.texto}</p>

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
                <button
                  type="button"
                  onClick={copiarPalavras}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
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

          <div>
            <label className="block text-xs text-text-tertiary mb-1">Quer ajustar? Diga o que mudar</label>
            <input
              className={inputClass}
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              placeholder="Ex: foque em público fitness, destaque que é kit com 3"
              maxLength={300}
            />
          </div>

          {confirmando ? (
            <div className="rounded-md border border-border bg-surface-1 p-2.5">
              <p className="text-sm text-text-primary mb-2">Isso vai substituir o texto que já está no campo.</p>
              <div className="flex gap-2">
                <Button type="button" variant="primary" onClick={aplicar}>
                  Substituir
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={aplicar}>
                <Check size={14} /> Usar este
              </Button>
              <Button type="button" variant="secondary" loading={pending} onClick={disparar}>
                <RefreshCw size={14} /> Gerar outro
              </Button>
              <Button type="button" variant="secondary" onClick={() => setSugestao(null)}>
                <X size={14} /> Descartar
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-text-tertiary">
            {/* O texto vai para a vitrine pública — quem publica responde por ele. */}
            <span>Revise antes de publicar: a IA pode errar detalhe do produto.</span>
            <span className="shrink-0 flex items-center gap-1">
              {sugestao.doCache && (
                <span className="flex items-center gap-1 text-accent" title="Já tinha sido gerado antes: não consumiu cota">
                  <Zap size={11} /> cache
                </span>
              )}
              {sugestao.usadas}/{sugestao.limite} hoje
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
