"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { LIMITE_INSTRUCOES } from "@/lib/ia/estilo-loja";
import type { ExemploMarca, PerfilMarca } from "@/lib/marca/tipos";
import { alternarExemploMarca, removerExemploMarca, salvarDirecaoMarca } from "@/app/(painel)/produtos/marca/actions";

const ROTULO_TIPO = { titulo: "Título", descricao: "Descrição" } as const;

/**
 * Direção da IA do perfil (0109): instruções de base que entram em toda geração de título e
 * de descrição, e os exemplos que a IA imita (as edições que você salvou e, com a loja ligada,
 * os anúncios que ela já tem). `key` no consumidor: trocar de perfil remonta com o texto dele.
 */
export function DirecaoIA({ perfil, exemplos, semMigracao, leitorLoja }: { perfil: PerfilMarca; exemplos: ExemploMarca[]; semMigracao: boolean; leitorLoja?: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [titulo, setTitulo] = useState(perfil.instrucoes_titulo ?? "");
  const [descricao, setDescricao] = useState(perfil.instrucoes_descricao ?? "");
  const mudou = titulo !== (perfil.instrucoes_titulo ?? "") || descricao !== (perfil.instrucoes_descricao ?? "");

  const doPerfil = exemplos.filter((e) => e.perfil_id === perfil.id || e.perfil_id === null);
  const edicoes = doPerfil.filter((e) => e.origem === "edicao");
  const daLoja = doPerfil.filter((e) => e.origem === "loja");

  function salvar() {
    startTransition(async () => {
      await executarComToast(salvarDirecaoMarca({ perfil_id: perfil.id, instrucoes_titulo: titulo.trim() || null, instrucoes_descricao: descricao.trim() || null }), {
        sucesso: "Direção salva: vale para as próximas gerações.",
        erro: "Não foi possível salvar.",
      });
    });
  }

  const linha = (e: ExemploMarca) => (
    <li key={e.id} className="flex items-start gap-2 py-2 border-b border-border last:border-b-0">
      <input type="checkbox" className="mt-1" checked={e.ativo} aria-label={`Usar este exemplo de ${ROTULO_TIPO[e.tipo].toLowerCase()}`} disabled={pending} onChange={(ev) => startTransition(async () => void (await executarComToast(alternarExemploMarca(e.id, ev.target.checked), { erro: "Não foi possível alterar." })))} />
      <div className={`flex-1 min-w-0 text-sm ${e.ativo ? "text-text-primary" : "text-text-tertiary"}`}>
        <span className="block text-xs text-text-tertiary">
          {ROTULO_TIPO[e.tipo]}
          {e.referencia ? ` · item ${e.referencia}` : ""}
          {e.ativo ? "" : " · pausado"}
        </span>
        <p className="whitespace-pre-line break-words line-clamp-4">{e.texto}</p>
        {e.texto_ia && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-text-secondary">Ver o que a IA tinha escrito</summary>
            <p className="mt-1 whitespace-pre-line break-words text-xs text-text-secondary">{e.texto_ia}</p>
          </details>
        )}
      </div>
      <IconButton
        aria-label="Apagar exemplo"
        onClick={async () => {
          if (!(await confirm({ title: "Apagar este exemplo?", message: "A IA deixa de usá-lo. Se só quiser pausar, desmarque a caixa ao lado.", confirmLabel: "Apagar" }))) return;
          startTransition(async () => void (await executarComToast(removerExemploMarca(e.id), { erro: "Não foi possível apagar." })));
        }}
      >
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </li>
  );

  if (semMigracao) {
    return (
      <Card>
        <p className="text-sm text-text-secondary" role="alert">
          As instruções e os exemplos da IA precisam da migração 0109. Aplique no Supabase e recarregue.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Instruções de base</CardTitle>
            <CardSubtitle>A direção que a IA segue em todo título e descrição deste perfil, além da memória e dos termos.</CardSubtitle>
          </div>
        </CardHeader>
        <FormField label="Para os títulos" dica={`${titulo.length}/${LIMITE_INSTRUCOES.toLocaleString("pt-BR")}`}>
          <textarea className={`${inputClass} h-24 py-2 resize-y`} value={titulo} maxLength={LIMITE_INSTRUCOES} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Comece pelo nome do produto e o peso. Use “Natural” quando fizer sentido. Nunca use abreviação." />
        </FormField>
        <FormField label="Para as descrições" dica={`${descricao.length}/${LIMITE_INSTRUCOES.toLocaleString("pt-BR")}`}>
          <textarea className={`${inputClass} h-32 py-2 resize-y`} value={descricao} maxLength={LIMITE_INSTRUCOES} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Tom acolhedor, frases curtas. Abra com o uso no dia a dia, depois os destaques em tópicos e termine com o modo de conservar." />
        </FormField>
        <Button variant="primary" onClick={salvar} loading={pending} disabled={pending || !mudou}>
          <Check size={14} aria-hidden /> Salvar instruções
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Exemplos que a IA imita</CardTitle>
            <CardSubtitle>Ela copia o tom e a estrutura, nunca os dados de outro produto. Marque para usar, desmarque para pausar.</CardSubtitle>
          </div>
        </CardHeader>

        <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1">Aprendido com as suas edições ({edicoes.length})</h4>
        {edicoes.length === 0 ? (
          <p className="text-sm text-text-secondary mb-3">Quando você mudar uma descrição ou digitar o seu próprio título e salvar, a sua versão aparece aqui e passa a guiar as próximas. As 8 mais recentes de cada tipo ficam.</p>
        ) : (
          <ul className="mb-3">{edicoes.map(linha)}</ul>
        )}

        <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1 mt-2">Anúncios da sua loja ({daLoja.length})</h4>
        {leitorLoja}
        {daLoja.length > 0 && <ul className="mt-2">{daLoja.map(linha)}</ul>}
      </Card>
      {ConfirmDialog}
    </div>
  );
}
