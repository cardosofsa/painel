"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload } from "lucide-react";
import { Modal, FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { executarComToast } from "@/lib/acao-cliente";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { derivarTokens } from "@/lib/cores";
import { FONTES_VITRINE, type FonteVitrine } from "@/lib/ia/prompts";
import {
  obterAparenciaCatalogo,
  salvarAparenciaCatalogo,
  gerarTemaCatalogoIA,
  type AparenciaCatalogo,
} from "@/app/(painel)/catalogo/aparencia-actions";
import type { Catalogo } from "@/app/(painel)/catalogo/CatalogoClient";

const PADRAO: AparenciaCatalogo = {
  cor_primaria: "#3b4d1f",
  cor_fundo: "#fafafa",
  cor_superficie: "#ffffff",
  cor_texto: "#18181b",
  fonte: "geist",
  logo_url: null,
  titulo: null,
  mensagem_boas_vindas: null,
};

const ROTULO_FONTE: Record<FonteVitrine, string> = {
  geist: "Geist (padrão do sistema)",
  inter: "Inter",
  lora: "Lora (com serifa)",
  poppins: "Poppins",
};

/**
 * Personalização visual de um catálogo (migração 0028).
 *
 * A IA só SUGERE — o painel abre a prévia com "Usar" / "Descartar", igual ao gerador de
 * título e descrição. `derivarTokens` roda aqui também, na prévia, para o dono ver a
 * versão JÁ CORRIGIDA para contraste antes de decidir usar — nunca a saída crua da IA.
 */
export function AparenciaModal({
  catalogo,
  iaDisponivel,
  onClose,
}: {
  catalogo: Catalogo | null;
  iaDisponivel: boolean;
  onClose: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [dados, setDados] = useState<AparenciaCatalogo>(PADRAO);
  const [dadosOriginais, setDadosOriginais] = useState<AparenciaCatalogo>(PADRAO);

  const [descricaoLoja, setDescricaoLoja] = useState("");
  const [instrucaoExtra, setInstrucaoExtra] = useState("");
  const [gerando, setGerando] = useState(false);
  const [sugestao, setSugestao] = useState<AparenciaCatalogo | null>(null);

  const { enviar: enviarLogo, enviando: enviandoLogo } = useSupabaseUpload("produtos");

  // `carregando`/`sugestao` começam com o valor certo (`useState` acima) porque o pai
  // remonta este componente por `key` a cada troca de catálogo — mesmo padrão de
  // `PrecosCatalogoModal` neste arquivo. Sem isso, precisaria de `setState` síncrono aqui
  // dentro, que o projeto evita de propósito (ver `GeradorIA.tsx`).
  useEffect(() => {
    if (!catalogo) return;
    executarComToast(obterAparenciaCatalogo(catalogo.id), { erro: "Erro ao carregar aparência" })
      .then((r) => {
        if (r.ok) {
          setDados(r.dado);
          setDadosOriginais(r.dado);
        }
      })
      .finally(() => setCarregando(false));
  }, [catalogo]);

  // Sugestão da IA ainda não aplicada também conta como "sujo": fechar sem querer descarta
  // uma geração que pode ter custado cota.
  const sujo = useFormularioSujo(dados, dadosOriginais) || sugestao !== null;

  async function gerarComIA() {
    if (!descricaoLoja.trim()) {
      toast.error("Descreva a loja em uma frase");
      return;
    }
    setGerando(true);
    const r = await executarComToast(
      gerarTemaCatalogoIA({ descricaoLoja, nomeNegocio: null, instrucaoExtra: instrucaoExtra.trim() || null }),
      { erro: "Erro ao gerar tema" },
    );
    setGerando(false);
    if (!r.ok) return;
    const { tema } = r.dado;
    setSugestao({
      cor_primaria: tema.corPrimaria,
      cor_fundo: tema.corFundo,
      cor_superficie: tema.corSuperficie,
      cor_texto: tema.corTexto,
      fonte: tema.fonte,
      logo_url: dados.logo_url,
      titulo: tema.titulo ?? dados.titulo,
      mensagem_boas_vindas: tema.mensagemBoasVindas ?? dados.mensagem_boas_vindas,
    });
  }

  function usarSugestao() {
    if (!sugestao) return;
    setDados(sugestao);
    setSugestao(null);
    toast.success("Tema aplicado — revise e salve");
  }

  async function enviarLogoArquivo(file: File) {
    const resultado = await enviarLogo(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: `logo-${catalogo?.id}` });
    if (resultado) setDados((prev) => ({ ...prev, logo_url: resultado.publicUrl }));
  }

  async function salvar() {
    if (!catalogo) return;
    setSalvando(true);
    const r = await executarComToast(salvarAparenciaCatalogo(catalogo.id, dados), {
      sucesso: "Aparência salva",
      erro: "Erro ao salvar aparência",
    });
    setSalvando(false);
    if (r.ok) onClose();
  }

  const previa = derivarTokens({
    corPrimaria: (sugestao ?? dados).cor_primaria,
    corFundo: (sugestao ?? dados).cor_fundo,
    corSuperficie: (sugestao ?? dados).cor_superficie,
    corTexto: (sugestao ?? dados).cor_texto,
  });

  return (
    <Modal
      open={!!catalogo}
      onClose={onClose}
      title={catalogo ? `Aparência — ${catalogo.nome}` : ""}
      width="max-w-xl"
      sujo={sujo}
    >
      {carregando ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {iaDisponivel && (
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Sparkles size={14} className="text-accent" />
                Gerar com IA
              </div>
              <input
                className={inputClass}
                value={descricaoLoja}
                onChange={(e) => setDescricaoLoja(e.target.value)}
                placeholder="Descreva sua loja em uma frase (ex: perfumaria feminina, elegante e delicada)"
              />
              <input
                className={inputClass}
                value={instrucaoExtra}
                onChange={(e) => setInstrucaoExtra(e.target.value)}
                placeholder="Instrução extra (opcional): cores mais escuras, mais jovem…"
              />
              <Button variant="secondary" onClick={gerarComIA} loading={gerando} disabled={!descricaoLoja.trim()}>
                <Sparkles size={14} />
                Sugerir tema
              </Button>

              {sugestao && (
                <div className="border-t border-border pt-2 mt-1">
                  <p className="text-xs text-text-tertiary mb-2">Prévia da sugestão (já corrigida para contraste):</p>
                  <div
                    className="rounded-md border p-3 mb-2"
                    style={{ background: previa.background, borderColor: previa.border }}
                  >
                    <div
                      className="rounded-md p-2.5"
                      style={{ background: previa.surface1, color: previa.textPrimary, border: `1px solid ${previa.border}` }}
                    >
                      <div style={{ color: previa.textPrimary, fontWeight: 600 }}>{sugestao.titulo || catalogo?.nome}</div>
                      {sugestao.mensagem_boas_vindas && (
                        <div style={{ color: previa.textSecondary, fontSize: 12, marginTop: 2 }}>
                          {sugestao.mensagem_boas_vindas}
                        </div>
                      )}
                      <div
                        className="inline-block mt-2 px-3 py-1 rounded-md text-xs font-medium"
                        style={{ background: previa.accent, color: previa.accentOn }}
                      >
                        Comprar
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setSugestao(null)}>
                      Descartar
                    </Button>
                    <Button variant="primary" className="flex-1" onClick={usarSugestao}>
                      Usar este tema
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["cor_primaria", "Cor primária"],
                ["cor_fundo", "Fundo"],
                ["cor_superficie", "Superfície (cartões)"],
                ["cor_texto", "Texto"],
              ] as const
            ).map(([campo, rotulo]) => (
              <FormField key={campo} label={rotulo}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={dados[campo]}
                    onChange={(e) => setDados((prev) => ({ ...prev, [campo]: e.target.value }))}
                    className="w-9 h-9 rounded-md border border-border shrink-0 cursor-pointer"
                  />
                  <input
                    value={dados[campo]}
                    onChange={(e) => setDados((prev) => ({ ...prev, [campo]: e.target.value }))}
                    className={`${campoBase} w-full font-mono text-xs`}
                  />
                </div>
              </FormField>
            ))}
          </div>

          <FormField label="Fonte">
            <select
              className={inputClass}
              value={dados.fonte}
              onChange={(e) => setDados((prev) => ({ ...prev, fonte: e.target.value as FonteVitrine }))}
            >
              {FONTES_VITRINE.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FONTE[f]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Logo (opcional)">
            <div className="flex items-center gap-3">
              {dados.logo_url ? (
                <ImagemStorage src={dados.logo_url} alt="" className="w-10 h-10 rounded-md object-cover border border-border shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-md border border-border shrink-0 flex items-center justify-center text-text-tertiary">
                  <Upload size={16} />
                </div>
              )}
              <CampoArquivo onArquivo={enviarLogoArquivo} disabled={enviandoLogo} />
            </div>
          </FormField>

          <FormField label="Título da vitrine (opcional)" dica="Sem título, mostra o nome do catálogo.">
            <input
              className={inputClass}
              value={dados.titulo ?? ""}
              maxLength={60}
              onChange={(e) => setDados((prev) => ({ ...prev, titulo: e.target.value || null }))}
            />
          </FormField>

          <FormField label="Mensagem de boas-vindas (opcional)">
            <input
              className={inputClass}
              value={dados.mensagem_boas_vindas ?? ""}
              maxLength={160}
              onChange={(e) => setDados((prev) => ({ ...prev, mensagem_boas_vindas: e.target.value || null }))}
            />
          </FormField>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
              Salvar aparência
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
