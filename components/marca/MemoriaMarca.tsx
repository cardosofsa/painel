"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import type { MemoriaMarca } from "@/lib/marca/tipos";
import { adicionarMemoriaMarca, alternarMemoriaMarca, removerMemoriaMarca } from "@/app/(painel)/produtos/marca/actions";

const ROTULO_TIPO = { preferencia: "Preferência", regra: "Regra", aprendizado: "Aprendizado" } as const;

/**
 * Memória da loja: frases curtas que a IA lê antes de gerar ("capas sem pessoa", "sempre 6
 * imagens"). Você escreve, liga, desliga ou apaga; a IA só propõe, e nada vale sem a sua
 * aprovação. Sem perfil escolhido, vale para a conta toda.
 */
export function MemoriaMarcaCard({ perfilId, memorias }: { perfilId: string; memorias: MemoriaMarca[] }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [tipo, setTipo] = useState<MemoriaMarca["tipo"]>("preferencia");
  const [texto, setTexto] = useState("");
  const [escopo, setEscopo] = useState<"perfil" | "conta">("perfil");

  const doPerfil = memorias.filter((m) => m.perfil_id === perfilId);
  const daConta = memorias.filter((m) => m.perfil_id === null);

  function adicionar() {
    startTransition(async () => {
      const r = await executarComToast(adicionarMemoriaMarca({ perfil_id: escopo === "perfil" ? perfilId : null, tipo, texto, origem: "usuario" }), {
        sucesso: "Guardado na memória",
        erro: "Não foi possível guardar.",
      });
      if (r.ok) setTexto("");
    });
  }

  const linha = (m: MemoriaMarca) => (
    <li key={m.id} className="flex items-start gap-2 py-2 border-b border-border last:border-b-0">
      <input type="checkbox" className="mt-1" checked={m.ativo} aria-label={`Usar: ${m.texto}`} onChange={(e) => startTransition(async () => void (await executarComToast(alternarMemoriaMarca(m.id, e.target.checked), { erro: "Não foi possível alterar." })))} />
      <div className={`flex-1 min-w-0 text-sm ${m.ativo ? "text-text-primary" : "text-text-tertiary line-through"}`}>
        {m.texto}
        <span className="block text-xs text-text-tertiary no-underline">
          {ROTULO_TIPO[m.tipo]} · {m.origem === "ia" ? "sugerido pela IA e aprovado por você" : "escrito por você"}
        </span>
      </div>
      <IconButton
        aria-label="Apagar"
        onClick={async () => {
          if (!(await confirm({ title: "Apagar da memória?", message: `“${m.texto.slice(0, 120)}” deixa de valer para a IA. Se só quiser pausar, desmarque a caixa ao lado.`, confirmLabel: "Apagar" }))) return;
          startTransition(async () => void (await executarComToast(removerMemoriaMarca(m.id), { erro: "Não foi possível apagar." })));
        }}
      >
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </li>
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Memória da loja</CardTitle>
          <CardSubtitle>O que a IA deve lembrar. Marque para usar, desmarque para pausar.</CardSubtitle>
        </div>
      </CardHeader>

      {doPerfil.length === 0 && daConta.length === 0 ? (
        <p className="text-sm text-text-secondary mb-3">Nada guardado ainda. Ex.: “Capas sem pessoa”, “Sempre 6 imagens”.</p>
      ) : (
        <ul className="mb-3">
          {doPerfil.map(linha)}
          {daConta.length > 0 && <li className="pt-2 text-xs uppercase tracking-wide text-text-tertiary">Vale para a conta toda</li>}
          {daConta.map(linha)}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr_auto] gap-2 items-end">
        <select aria-label="Tipo" className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as MemoriaMarca["tipo"])}>
          {(Object.keys(ROTULO_TIPO) as MemoriaMarca["tipo"][]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
        <select aria-label="Vale para" className={inputClass} value={escopo} onChange={(e) => setEscopo(e.target.value as "perfil" | "conta")}>
          <option value="perfil">Este perfil</option>
          <option value="conta">Toda a conta</option>
        </select>
        <input className={inputClass} value={texto} maxLength={240} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma preferência ou regra" />
        <Button variant="secondary" onClick={adicionar} loading={pending} disabled={pending || texto.trim().length < 3}>
          <Plus size={14} /> Guardar
        </Button>
      </div>
      {ConfirmDialog}
    </Card>
  );
}
