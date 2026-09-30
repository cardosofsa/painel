"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { ORDEM_PROVEDORES, PROVEDORES, type ProvedorId } from "@/lib/ia/provedores/catalogo";
import { adicionarIA, testarChaveIA } from "@/app/(painel)/configuracoes/ia-actions";

/**
 * Cadastro de uma IA em dois passos: (1) provedor + chave → "Testar e listar modelos";
 * (2) escolher o modelo (a lista vem do próprio provedor, mas dá para digitar outro) e
 * salvar. O servidor ainda faz uma chamada real de prova antes de gravar.
 *
 * `key` no consumidor: fechar e abrir zera tudo, inclusive a chave digitada.
 */
export function AdicionarIAModal({ open, onClose, primeira }: { open: boolean; onClose: () => void; primeira: boolean }) {
  const [pending, startTransition] = useTransition();
  const [provedor, setProvedor] = useState<ProvedorId>("gemini");
  const [chave, setChave] = useState("");
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [modelo, setModelo] = useState("");
  const [padrao, setPadrao] = useState(true);

  const sujo = chave.trim() !== "";
  const info = PROVEDORES[provedor];

  function mudarProvedor(p: ProvedorId) {
    setProvedor(p);
    // Lista e modelo pertencem ao provedor e à chave anteriores.
    setModelos(null);
    setModelo("");
  }

  function testar() {
    startTransition(async () => {
      const r = await executarComToast(testarChaveIA({ provedor, chave }), { erro: "Não foi possível testar a chave" });
      if (r.ok) {
        setModelos(r.dado);
        if (r.dado.length === 0) setModelo("");
      }
    });
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(adicionarIA({ provedor, chave, modelo, padrao: padrao || primeira }), {
        erro: "Não foi possível cadastrar a IA",
      });
      if (r.ok) onClose();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar IA" width="max-w-lg" sujo={sujo}>
      <FormField label="Provedor">
        <select className={inputClass} value={provedor} onChange={(e) => mudarProvedor(e.target.value as ProvedorId)}>
          {ORDEM_PROVEDORES.map((p) => (
            <option key={p} value={p}>
              {PROVEDORES[p].nome}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Chave da API" dica={`Crie em ${info.ondeCriarChave}. Ela é guardada criptografada e nunca aparece de novo.`}>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
          value={chave}
          onChange={(e) => {
            setChave(e.target.value);
            setModelos(null);
          }}
          placeholder="Cole a chave aqui"
        />
      </FormField>

      {modelos === null ? (
        <Button variant="secondary" className="w-full" onClick={testar} loading={pending} disabled={chave.trim().length < 8}>
          Testar chave e listar modelos
        </Button>
      ) : (
        <>
          <p className="text-xs text-positive mb-3">Chave válida. {modelos.length} modelo(s) disponíveis.</p>
          <FormField label="Modelo" dica={`Escolha da lista ou digite outro. Exemplo: ${info.exemploModelo}`}>
            <input
              className={inputClass}
              list="modelos-ia"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder={info.exemploModelo}
              autoComplete="off"
            />
            <datalist id="modelos-ia">
              {modelos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </FormField>

          {!primeira && (
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer mb-3">
              <input
                type="checkbox"
                className="w-4 h-4 accent-accent"
                checked={padrao}
                onChange={(e) => setPadrao(e.target.checked)}
              />
              Usar esta IA nos recursos do sistema
            </label>
          )}

          <div className="flex gap-2 mt-4">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={salvar} loading={pending} disabled={!modelo.trim()}>
              Salvar IA
            </Button>
          </div>
          <p className="text-[11px] text-text-tertiary mt-2">
            Ao salvar, fazemos uma chamada mínima para confirmar que o modelo responde (custo de poucos centavos de token).
          </p>
        </>
      )}
    </Modal>
  );
}
