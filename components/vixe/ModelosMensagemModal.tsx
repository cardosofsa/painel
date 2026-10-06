"use client";

import { useRef, useState, useTransition } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ASSUNTOS_MODELO, LIMITE_MODELO, MODELOS, modeloDe, previaModelo, variaveisDesconhecidas, type AssuntoModelo, type ModelosConta } from "@/lib/vixe/modelos";
import { executarComToast } from "@/lib/acao-cliente";
import { restaurarModeloMensagem, salvarModeloMensagem } from "@/app/(painel)/vixe/mensagens/actions";

/** Editor dos textos de cada aviso, com as variáveis e a prévia ao vivo. */
export function ModelosMensagemModal({ modelos, habilitado, onClose }: { modelos: ModelosConta; habilitado: boolean; onClose: () => void }) {
  const [assunto, setAssunto] = useState<AssuntoModelo>("fiado_vencido");
  return (
    <Modal open onClose={onClose} title="Modelos de mensagem" width="max-w-2xl">
      {!habilitado && <p className="text-sm text-negative mb-3">Salvar modelos próprios precisa da migração 0069. Por enquanto valem os textos padrão.</p>}
      <FormField label="Mensagem">
        <select className={inputClass} value={assunto} onChange={(e) => setAssunto(e.target.value as AssuntoModelo)}>
          {ASSUNTOS_MODELO.map((a) => (
            <option key={a} value={a}>
              {MODELOS[a].rotulo}
              {modelos[a] ? " (personalizado)" : ""}
            </option>
          ))}
        </select>
      </FormField>
      {/* `key`: trocar o assunto remonta o editor com o texto daquele assunto. */}
      <EditorModelo key={assunto} assunto={assunto} inicial={modeloDe(assunto, modelos)} proprio={!!modelos[assunto]} habilitado={habilitado} onClose={onClose} />
    </Modal>
  );
}

function EditorModelo({ assunto, inicial, proprio, habilitado, onClose }: { assunto: AssuntoModelo; inicial: string; proprio: boolean; habilitado: boolean; onClose: () => void }) {
  const def = MODELOS[assunto];
  const [texto, setTexto] = useState(inicial);
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const desconhecidas = variaveisDesconhecidas(assunto, texto);

  function inserir(nome: string) {
    const el = area.current;
    const marca = `{${nome}}`;
    if (!el) return setTexto((t) => t + marca);
    const [a, b] = [el.selectionStart ?? texto.length, el.selectionEnd ?? texto.length];
    setTexto(texto.slice(0, a) + marca + texto.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + marca.length, a + marca.length);
    });
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(salvarModeloMensagem({ assunto, texto }), { sucesso: "Modelo salvo.", erro: "Erro ao salvar o modelo" });
      if (r.ok) onClose();
    });
  }
  function restaurar() {
    startTransition(async () => {
      const r = await executarComToast(restaurarModeloMensagem(assunto), { sucesso: "Voltou ao texto padrão.", erro: "Erro ao restaurar" });
      if (r.ok) onClose();
    });
  }

  return (
    <>
      <p className="text-xs text-text-tertiary -mt-2 mb-3">{def.quando}</p>
      <FormField label="Texto">
        <textarea ref={area} className={`${inputClass} h-32 py-2 resize-y`} value={texto} maxLength={LIMITE_MODELO} onChange={(e) => setTexto(e.target.value)} />
      </FormField>
      <div className="flex flex-wrap gap-1.5 mb-3" aria-label="Variáveis">
        {def.variaveis.map((v) => (
          <button key={v.nome} type="button" title={v.descricao} onClick={() => inserir(v.nome)} className="text-xs font-mono rounded-md border border-border bg-surface-2 px-2 py-1 text-text-secondary hover:text-text-primary hover:border-border-forte">
            {`{${v.nome}}`}
          </button>
        ))}
      </div>
      {desconhecidas.length > 0 && <p className="text-xs text-negative mb-3">Variável que esta mensagem não conhece: {desconhecidas.map((d) => `{${d}}`).join(", ")}.</p>}
      <div className="rounded-md border border-border bg-surface-2 p-3 mb-4">
        <div className="text-xs font-medium text-text-tertiary mb-1">Prévia</div>
        <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{previaModelo(assunto, texto)}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-between">
        <Button variant="ghost" onClick={() => setTexto(def.padrao)} disabled={texto === def.padrao}>
          Usar o texto padrão
        </Button>
        <div className="flex gap-2">
          {proprio && (
            <Button variant="secondary" onClick={restaurar} loading={pending} disabled={!habilitado}>
              Apagar o meu
            </Button>
          )}
          <Button variant="primary" onClick={salvar} loading={pending} disabled={!habilitado || !texto.trim() || desconhecidas.length > 0}>
            Salvar
          </Button>
        </div>
      </div>
    </>
  );
}
