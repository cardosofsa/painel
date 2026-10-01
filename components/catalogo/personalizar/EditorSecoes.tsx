"use client";

import { Plus, Trash2 } from "lucide-react";
import { FormField, inputClass } from "@/components/ui/Modal";
import { LIMITES_SECOES as L, type SecoesVitrine } from "@/lib/vixe/vitrine";

/**
 * Editor das seções da vitrine (destaque, sobre, diferenciais, chamada, rodapé). Campo
 * vazio = seção some da vitrine. Os limites são os mesmos que o servidor aplica.
 */
export function EditorSecoes({ secoes, onChange }: { secoes: SecoesVitrine; onChange: (s: SecoesVitrine) => void }) {
  const difs = secoes.diferenciais ?? [];
  const area = `${inputClass} h-auto py-2 resize-y`;

  function setDif(i: number, campo: "titulo" | "texto", v: string) {
    const nova = difs.map((d, j) => (j === i ? { ...d, [campo]: v } : d));
    onChange({ ...secoes, diferenciais: nova });
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-primary mb-1">Destaque (topo)</legend>
        <FormField label="Título">
          <input
            className={inputClass}
            maxLength={L.destaqueTitulo}
            value={secoes.destaque?.titulo ?? ""}
            onChange={(e) => onChange({ ...secoes, destaque: { titulo: e.target.value, subtitulo: secoes.destaque?.subtitulo ?? null } })}
            placeholder="Ex: Doces caseiros feitos com carinho"
          />
        </FormField>
        <FormField label="Subtítulo (opcional)">
          <input
            className={inputClass}
            maxLength={L.destaqueSubtitulo}
            value={secoes.destaque?.subtitulo ?? ""}
            onChange={(e) => onChange({ ...secoes, destaque: { titulo: secoes.destaque?.titulo ?? "", subtitulo: e.target.value || null } })}
          />
        </FormField>
      </fieldset>

      <FormField label="Sobre a loja">
        <textarea className={area} rows={4} maxLength={L.sobre} value={secoes.sobre?.texto ?? ""} onChange={(e) => onChange({ ...secoes, sobre: { texto: e.target.value } })} />
      </FormField>

      <fieldset>
        <div className="flex items-center justify-between mb-1">
          <legend className="text-sm font-medium text-text-primary">Diferenciais (até 3)</legend>
          {difs.length < 3 && (
            <button type="button" className="text-xs text-accent hover:underline inline-flex items-center gap-1" onClick={() => onChange({ ...secoes, diferenciais: [...difs, { titulo: "", texto: "" }] })}>
              <Plus size={12} /> Adicionar
            </button>
          )}
        </div>
        <div className="space-y-2">
          {difs.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
              <input className={inputClass} maxLength={L.diferencialTitulo} placeholder="Ex: Entrega no bairro" value={d.titulo} onChange={(e) => setDif(i, "titulo", e.target.value)} />
              <input className={inputClass} maxLength={L.diferencialTexto} placeholder="Explique em uma frase" value={d.texto} onChange={(e) => setDif(i, "texto", e.target.value)} />
              <button type="button" aria-label="Remover diferencial" className="text-text-tertiary hover:text-negative px-1" onClick={() => onChange({ ...secoes, diferenciais: difs.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {difs.length === 0 && <p className="text-xs text-text-tertiary">Só o que for verdade: entrega, atendimento, garantia, origem…</p>}
        </div>
      </fieldset>

      <FormField label="Chamada para o WhatsApp">
        <input className={inputClass} maxLength={L.chamada} value={secoes.chamada?.texto ?? ""} onChange={(e) => onChange({ ...secoes, chamada: { texto: e.target.value } })} placeholder="Ex: Ficou com dúvida? Fale com a gente" />
      </FormField>
      <FormField label="Rodapé">
        <input className={inputClass} maxLength={L.rodape} value={secoes.rodape?.texto ?? ""} onChange={(e) => onChange({ ...secoes, rodape: { texto: e.target.value } })} />
      </FormField>
    </div>
  );
}
