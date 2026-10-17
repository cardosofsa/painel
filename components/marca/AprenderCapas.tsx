"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { executarComToast } from "@/lib/acao-cliente";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { diferencasFicha, mesclarFicha } from "@/lib/marca/ficha";
import { regrasDaPlataforma } from "@/lib/marca/plataformas";
import { urlPublicaImagem, type FichaSalva, type PerfilMarca } from "@/lib/marca/tipos";
import type { PropostaMarca } from "@/lib/ia/prompts-marca";
import { adicionarMemoriaMarca, aprenderDasCapas, salvarFichaMarca } from "@/app/(painel)/produtos/marca/actions";
import { montarMontagem } from "./montagem";

/**
 * "Aprender das minhas capas": a IA olha as capas que você enviou e PROPÕE a ficha da Capa 1 e
 * algumas observações. Nada é salvo sozinho: você vê o que mudaria, e só então salva.
 */
export function AprenderCapas({ perfil, fichas, iaDisponivel }: { perfil: PerfilMarca; fichas: FichaSalva[]; iaDisponivel: boolean }) {
  const [pending, startTransition] = useTransition();
  const { enviar } = useSupabaseUpload("produtos");
  const [proposta, setProposta] = useState<PropostaMarca | null>(null);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());

  const atual = fichas.find((f) => f.perfil_id === perfil.id && f.tipo_imagem === "capa_1" && f.ativa)?.dados ?? {};
  const semCapas = perfil.referencias.length === 0;
  const diferencas = proposta ? diferencasFicha(atual, mesclarFicha(atual, proposta.ficha)) : [];

  function aprender() {
    startTransition(async () => {
      let url: string;
      try {
        const montagem = await montarMontagem(perfil.referencias.map(urlPublicaImagem));
        const up = await enviar(new File([montagem], "montagem.jpg", { type: "image/jpeg" }), { maxSizeMb: 4, tiposAceitos: ["image/"], prefixo: "marca-montagem" });
        if (!up) return;
        url = up.publicUrl;
      } catch (e) {
        await executarComToast(Promise.resolve({ ok: false as const, erro: e instanceof Error ? e.message : "Não consegui preparar as capas." }), { erro: "Não consegui preparar as capas." });
        return;
      }
      const r = await executarComToast(aprenderDasCapas({ url, plataforma: perfil.plataforma, nicho: perfil.nicho, capas: perfil.referencias.length }), {
        erro: "Não foi possível analisar as capas.",
      });
      if (r.ok) {
        setProposta(r.dado.proposta);
        setGuardadas(new Set());
      }
    });
  }

  function salvarFicha() {
    if (!proposta) return;
    startTransition(async () => {
      const r = await executarComToast(
        salvarFichaMarca({ perfil_id: perfil.id, tipo_imagem: "capa_1", dados: mesclarFicha(atual, proposta.ficha), origem: "ia_capas", nota: `Aprendida de ${perfil.referencias.length} capa(s)` }),
        { sucesso: "Ficha da Capa 1 salva", erro: "Não foi possível salvar a ficha." },
      );
      if (r.ok) setProposta(null);
    });
  }

  function guardarMemoria(m: PropostaMarca["memorias"][number]) {
    startTransition(async () => {
      const r = await executarComToast(adicionarMemoriaMarca({ perfil_id: perfil.id, tipo: m.tipo, texto: m.texto, origem: "ia" }), { sucesso: "Guardado na memória", erro: "Não foi possível guardar." });
      if (r.ok) setGuardadas((s) => new Set(s).add(m.texto));
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Aprender das minhas capas</CardTitle>
          <CardSubtitle>A IA lê as capas de referência de {regrasDaPlataforma(perfil.plataforma).nome} e sugere o seu padrão. Você revisa antes de salvar.</CardSubtitle>
        </div>
      </CardHeader>

      {!proposta && (
        <>
          <Button variant="secondary" onClick={aprender} loading={pending} disabled={pending || semCapas || !iaDisponivel}>
            <Sparkles size={14} /> Analisar {perfil.referencias.length || ""} capa{perfil.referencias.length === 1 ? "" : "s"}
          </Button>
          <p className="text-xs text-text-tertiary mt-2">
            {!iaDisponivel ? "Configure uma IA em Configurações para usar este recurso." : semCapas ? "Envie capas de referência no perfil acima e salve o perfil." : "Usa 1 geração da sua cota. Salve o perfil antes se acabou de enviar capas."}
          </p>
        </>
      )}

      {proposta && (
        <div className="space-y-4">
          {proposta.resumo && <p className="text-sm text-text-primary">{proposta.resumo}</p>}

          {diferencas.length === 0 ? (
            <p className="text-sm text-text-secondary">Nada novo em relação à ficha atual da Capa 1.</p>
          ) : (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1.5">O que a ficha da Capa 1 passaria a ter</h4>
              <ul className="space-y-1 text-sm">
                {diferencas.map((d) => (
                  <li key={d.campo}>
                    <span className="font-medium text-text-primary">{d.rotulo}:</span> <span className="text-text-tertiary">{d.de}</span> → <span className="text-text-primary">{d.para}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposta.memorias.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-1.5">Observações para guardar na memória</h4>
              <ul className="space-y-1.5 text-sm">
                {proposta.memorias.map((m) => (
                  <li key={m.texto} className="flex items-center justify-between gap-2">
                    <span className="text-text-primary">{m.texto}</span>
                    {guardadas.has(m.texto) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-positive">
                        <Check size={12} /> Guardado
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => guardarMemoria(m)} disabled={pending}>
                        Guardar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={salvarFicha} loading={pending} disabled={pending || diferencas.length === 0}>
              Salvar como nova versão da Capa 1
            </Button>
            <Button variant="ghost" onClick={() => setProposta(null)} disabled={pending}>
              Descartar
            </Button>
          </div>
          <p className="text-xs text-text-tertiary">A IA descreve só o que enxerga. Confira os campos e ajuste na ficha abaixo se algo não for o que você quer.</p>
        </div>
      )}
    </Card>
  );
}
