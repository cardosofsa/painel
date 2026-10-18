"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { regrasAtivas, temBloqueio, verificarTextos } from "@/lib/conformidade/termos";

const EXEMPLO_LIMPO = "Organizador de Gaveta Modular 6 Peças – Plástico Resistente, Fácil de Limpar";
const EXEMPLO_COM_PROBLEMA = "Melhor do Brasil! Cura ansiedade, 100% garantido, frete grátis, o mais barato do mercado";

/**
 * Conferidor rápido: cole um título, uma descrição ou o texto que vai numa imagem e veja se
 * aparece algo das regras gerais de marketplace ou dos termos que você marcou. É uma primeira
 * barreira automática: a revisão final continua sendo sua.
 */
export function ConferirTexto({ termosDoPerfil }: { termosDoPerfil: string[] }) {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<"texto" | "imagem">("texto");
  const violacoes = useMemo(() => verificarTextos([{ campo: tipo === "imagem" ? "Texto da imagem" : "Texto", texto, tipo }], regrasAtivas([], termosDoPerfil)), [texto, tipo, termosDoPerfil]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Conferir um texto</CardTitle>
          <CardSubtitle>Cole o título, a descrição ou o texto de uma imagem para ver se tem algo que a plataforma costuma barrar. Nada é enviado: a conferência roda aqui.</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex gap-2 mb-2">
        <select aria-label="Onde o texto aparece" className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as "texto" | "imagem")}>
          <option value="texto">Título ou descrição</option>
          <option value="imagem">Texto dentro de uma imagem</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-text-secondary">
        Testar com um exemplo:
        <button type="button" className="text-accent hover:underline" onClick={() => { setTipo("texto"); setTexto(EXEMPLO_LIMPO); }}>
          texto limpo
        </button>
        <button type="button" className="text-accent hover:underline" onClick={() => { setTipo("texto"); setTexto(EXEMPLO_COM_PROBLEMA); }}>
          texto com problema
        </button>
      </div>
      <textarea className={`${inputClass} h-24 py-2`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole o texto aqui" aria-label="Texto a conferir" />
      {texto.trim() && (
        <div className="mt-3" aria-live="polite">
          {violacoes.length === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-positive">
              <CheckCircle2 size={14} aria-hidden /> Nada encontrado nas regras ativas. Revise você mesmo antes de publicar.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {violacoes.map((v) => (
                <li key={`${v.campo}-${v.termo}`} className="flex gap-2">
                  <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${v.gravidade === "bloquear" ? "text-negative" : "text-text-secondary"}`} aria-hidden />
                  <span className="text-text-primary">
                    <strong>{v.gravidade === "bloquear" ? "Evite" : "Revise"}:</strong> “{v.trecho}” — {v.motivo.toLowerCase()}.
                  </span>
                </li>
              ))}
            </ul>
          )}
          {temBloqueio(violacoes) && <p className="text-xs text-text-tertiary mt-2">“Evite” são regras gerais que as plataformas costumam barrar; “Revise” vêm dos termos que você marcou.</p>}
        </div>
      )}
    </Card>
  );
}
