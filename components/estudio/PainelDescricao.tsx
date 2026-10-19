"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { inputClass } from "@/components/ui/Modal";
import { regrasDoPerfil, type TermosDoPerfil } from "@/lib/conformidade/termos";
import { avaliarDescricao, MINIMO_DESCRICAO } from "@/lib/ia/prompts-descricao-estudio";
import { numeroDaEtapa } from "@/lib/anuncio/etapas";

/** O texto editável. `key` no consumidor: uma geração nova (ou uma descrição salva) remonta com o texto novo. */
function Editor({ inicial, limite, termos, ocupado, onSalvar, onEditado }: { inicial: string; limite: number; termos: TermosDoPerfil; ocupado: boolean; onSalvar: (texto: string) => void; onEditado: (texto: string | null) => void }) {
  const [texto, setTexto] = useState(inicial);
  const avaliacao = useMemo(() => avaliarDescricao(texto, { limite, regras: regrasDoPerfil(termos) }), [texto, limite, termos]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-text-secondary">Descrição</span>
        <span className="flex items-center gap-1">
          <span className={`text-xs font-mono ${avaliacao.longa ? "text-negative" : "text-text-tertiary"}`}>
            {avaliacao.caracteres}/{limite.toLocaleString("pt-BR")}
          </span>
          <BotaoCopiar texto={texto} rotulo="descrição" compacto />
        </span>
      </div>
      <textarea className={`${inputClass} h-56 py-2 resize-y`} value={texto} maxLength={5000} onChange={(e) => {
          setTexto(e.target.value);
          onEditado(e.target.value !== inicial ? e.target.value : null);
        }}
        aria-label="Descrição do anúncio"
      />
      {avaliacao.curta && texto.trim() && <p className="mt-1.5 text-xs text-text-secondary">Curta demais: o mínimo é {MINIMO_DESCRICAO} caracteres.</p>}
      {avaliacao.violacoes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {avaliacao.violacoes.map((v) => (
            <li key={v.termo} className="flex gap-1.5 text-xs text-text-secondary">
              <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${v.gravidade === "bloquear" ? "text-negative" : ""}`} aria-hidden />
              {v.gravidade === "bloquear" ? "Evite" : "Revise"}: “{v.trecho}” — {v.motivo.toLowerCase()}.
            </li>
          ))}
        </ul>
      )}
      <Button className="mt-3" variant="primary" onClick={() => onSalvar(texto)} disabled={ocupado || !avaliacao.utilizavel} loading={ocupado}>
        <Check size={14} aria-hidden /> Salvar descrição
      </Button>
    </div>
  );
}

/**
 * Descrição. A IA escreve um rascunho, você edita à vontade (a conferência de termos roda a
 * cada tecla) e só o que você salva vira a descrição do anúncio; o servidor confere de novo.
 */
export function PainelDescricao({
  salva,
  geradaTexto,
  versao,
  limite,
  termos,
  titulo,
  iaDisponivel,
  ocupado,
  meta,
  onGerar,
  onSalvar,
  onPendente,
}: {
  /** O texto editado e ainda não salvo (ou `null`), para a proteção de saída da tela. */
  onPendente?: (texto: string | null) => void;
  salva: string | null;
  geradaTexto: string | null;
  versao: number;
  limite: number;
  termos: TermosDoPerfil;
  titulo: string | null;
  iaDisponivel: boolean;
  ocupado: boolean;
  meta: string | null;
  onGerar: (pedido: string | null) => void;
  onSalvar: (texto: string) => void;
}) {
  const [pedido, setPedido] = useState("");
  // O texto do editor mudou desde a geração ou o salvamento: "Gerar outra" pergunta antes de jogar fora.
  const [sujo, setSujo] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  async function gerarOutra() {
    if (sujo && !(await confirm({ title: "Descartar o que você editou?", message: "Gerar outra descrição substitui o texto do editor, inclusive as suas mudanças que ainda não foram salvas.", confirmLabel: "Gerar outra mesmo assim" }))) return;
    setSujo(false);
    onPendente?.(null);
    onGerar(pedido.trim() || null);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{numeroDaEtapa("descricao")}. Descrição</CardTitle>
          <CardSubtitle>Benefícios de uso, sem inventar medida, material nem promessa. Até {limite.toLocaleString("pt-BR")} caracteres.</CardSubtitle>
        </div>
      </CardHeader>

      {!titulo ? (
        <p className="text-sm text-text-secondary">Escolha o título primeiro: a descrição segue o título aprovado.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <input className={`${inputClass} flex-1 min-w-[12rem]`} value={pedido} maxLength={300} onChange={(e) => setPedido(e.target.value)} placeholder="Pedido opcional: mais curta, destacar o kit…" aria-label="Pedido para a descrição" />
            <Button variant="secondary" onClick={gerarOutra} loading={ocupado} disabled={ocupado || !iaDisponivel}>
              <Sparkles size={14} aria-hidden /> {geradaTexto || salva ? "Gerar outra" : "Gerar descrição"}
            </Button>
          </div>
          {meta && <p className="text-xs text-text-tertiary mb-2">{meta}</p>}
          <Editor key={`${versao}-${salva ?? ""}`} inicial={geradaTexto ?? salva ?? ""} limite={limite} termos={termos} ocupado={ocupado} onSalvar={(t) => {
              setSujo(false);
              onPendente?.(null);
              onSalvar(t);
            }}
            onEditado={(t) => {
              setSujo(t !== null);
              onPendente?.(t);
            }}
          />
          {salva && <p className="mt-2 text-xs text-text-tertiary">Descrição salva neste rascunho: {salva.length} caracteres.</p>}
        </>
      )}
      {ConfirmDialog}
    </Card>
  );
}
