"use client";

import { useState } from "react";
import { Check, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { ROTULO_CAMPO, ROTULO_TIPO_IMAGEM, valorLegivel, type FichaMarca } from "@/lib/marca/ficha";
import type { AcaoProposta } from "@/lib/ia/prompts-assistente";
import type { RascunhoAberto } from "@/app/(painel)/produtos/estudio/actions";

export function descreverAcao(a: AcaoProposta): { rotulo: string; botao: string } {
  switch (a.tipo) {
    case "definir_numero_imagens":
      return { rotulo: `Combinar ${a.n} ${a.n === 1 ? "imagem" : "imagens"} neste anúncio`, botao: "Combinar" };
    case "guardar_memoria":
      return { rotulo: `Guardar na memória: “${a.memoria.texto}”`, botao: "Guardar" };
    case "ajustar_ficha": {
      const campos = (Object.keys(a.campos) as (keyof FichaMarca)[]).map((c) => `${ROTULO_CAMPO[c]}: ${valorLegivel(c, a.campos[c])}`).join("; ");
      return { rotulo: `Ajustar a ficha (${ROTULO_TIPO_IMAGEM[a.tipoImagem]}) — ${campos}`, botao: "Aplicar ajuste" };
    }
    case "gerar_titulos":
      return { rotulo: `Gerar títulos${a.pedido ? `: ${a.pedido}` : ""}`, botao: "Gerar títulos" };
    case "gerar_capa":
      return a.modo === "imagem"
        ? { rotulo: "Gerar a capa aqui (usa 1 imagem da cota do mês)", botao: "Ir para a capa" }
        : { rotulo: "Montar o prompt da capa (sem custo)", botao: "Ir para a capa" };
    case "pesquisar_concorrentes":
      return { rotulo: "Pesquisar concorrentes na web (conta 1 geração)", botao: "Pesquisar" };
  }
}

/**
 * Conversa com o assistente. A IA responde e SUGERE ações; cada uma é um botão que você aprova.
 * Nada caro roda sozinho e nada é gravado sem o clique.
 */
export function ConversaAssistente({
  mensagens,
  texto,
  onTexto,
  enviando,
  iaDisponivel,
  meta,
  onEnviar,
  onAplicar,
}: {
  mensagens: RascunhoAberto["mensagens"];
  texto: string;
  onTexto: (t: string) => void;
  enviando: boolean;
  iaDisponivel: boolean;
  meta: string | null;
  onEnviar: () => void;
  onAplicar: (a: AcaoProposta) => Promise<boolean>;
}) {
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState<string | null>(null);

  async function aplicar(chave: string, a: AcaoProposta) {
    setAplicando(chave);
    const ok = await onAplicar(a);
    setAplicando(null);
    if (ok) setFeitas((s) => new Set(s).add(chave));
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Conversa com o assistente</CardTitle>
          <CardSubtitle>Diga o que quer em palavras simples: quantas imagens, o estilo, o que mudar. Ele sugere, você aprova.</CardSubtitle>
        </div>
      </CardHeader>

      <div className="max-h-[28rem] overflow-y-auto space-y-3 mb-3" role="log" aria-live="polite" aria-label="Conversa">
        {mensagens.length === 0 && (
          <p className="text-sm text-text-secondary flex gap-2">
            <MessageCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> Ex.: “quero 6 imagens e a capa sem pessoa” ou “faz o título mais curto”.
          </p>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={m.papel === "usuario" ? "text-right" : ""}>
            <p className={`inline-block max-w-full rounded-lg px-3 py-2 text-sm text-left ${m.papel === "usuario" ? "bg-accent-soft text-text-primary" : "bg-surface-2 text-text-primary"}`}>{m.texto}</p>
            {m.papel === "ia" && m.acoes.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {m.acoes.map((a, i) => {
                  const chave = `${m.id}:${i}`;
                  const d = descreverAcao(a);
                  return (
                    <li key={chave} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-xs text-text-secondary">
                      <span className="flex-1 min-w-[10rem]">{d.rotulo}</span>
                      {feitas.has(chave) ? (
                        <span className="inline-flex items-center gap-1 text-positive">
                          <Check size={12} aria-hidden /> Feito
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => aplicar(chave, a)} loading={aplicando === chave} disabled={aplicando !== null}>
                          {d.botao}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim() && !enviando) onEnviar();
        }}
      >
        <input className={`${inputClass} flex-1`} value={texto} maxLength={500} onChange={(e) => onTexto(e.target.value)} placeholder={iaDisponivel ? "Escreva para o assistente" : "Configure uma IA em Configurações"} disabled={!iaDisponivel} aria-label="Mensagem para o assistente" />
        <Button type="submit" variant="primary" loading={enviando} disabled={enviando || !iaDisponivel || texto.trim().length === 0}>
          <Send size={14} /> Enviar
        </Button>
      </form>
      {meta && <p className="text-xs text-text-tertiary mt-1.5">{meta}</p>}
    </Card>
  );
}
