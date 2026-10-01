"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Sparkles, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass, campoBase } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { FONTES_VITRINE, type FonteVitrine } from "@/lib/ia/prompts";
import { ESTILOS_VITRINE, ROTULO_ESTILO, type EstiloVitrine } from "@/lib/ia/prompts-vitrine";
import { normalizarSecoes, type SecoesVitrine } from "@/lib/vixe/vitrine";
import { salvarAparenciaCatalogo, salvarSecoesCatalogo, type AparenciaCatalogo } from "@/app/(painel)/catalogo/aparencia-actions";
import { gerarVitrineVixe } from "@/app/(painel)/vixe/actions";
import { EditorSecoes } from "./EditorSecoes";
import { PreviaVitrine } from "./PreviaVitrine";

const ROTULO_FONTE: Record<FonteVitrine, string> = { geist: "Geist (padrão do sistema)", inter: "Inter", lora: "Lora (com serifa)", poppins: "Poppins" };
type Aba = "marca" | "secoes" | "vixe";

/**
 * Catálogo › Personalizar: aparência (cores, fonte, logo, título), seções da vitrine e o
 * assistente da Vixe, com prévia ao vivo. Nada é gravado até "Salvar"; a Vixe só preenche
 * o formulário.
 */
export function PersonalizarCatalogo({
  catalogo,
  aparenciaInicial,
  secoesIniciais,
  empresa,
  iaDisponivel,
}: {
  catalogo: { id: string; nome: string; slug: string };
  aparenciaInicial: AparenciaCatalogo;
  secoesIniciais: SecoesVitrine;
  empresa: { nome: string | null; cidade: string | null; whatsapp: string | null; logoUrl: string | null };
  iaDisponivel: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("marca");
  const [ap, setAp] = useState<AparenciaCatalogo>(aparenciaInicial);
  const [secoes, setSecoes] = useState<SecoesVitrine>(secoesIniciais);
  const [salvando, setSalvando] = useState(false);
  const sujo = useFormularioSujo({ ap, secoes }, { ap: aparenciaInicial, secoes: secoesIniciais });
  const { enviar, enviando } = useSupabaseUpload("produtos");
  const secoesLimpas = useMemo(() => normalizarSecoes(secoes), [secoes]);

  // Assistente
  const [segmento, setSegmento] = useState("");
  const [publico, setPublico] = useState("");
  const [estilo, setEstilo] = useState<EstiloVitrine>("moderno");
  const [cores, setCores] = useState("");
  const [diferenciais, setDiferenciais] = useState("");
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const r = await executar(
        gerarVitrineVixe({ nomeNegocio: empresa.nome, segmento, publico: publico.trim() || null, estilo, cores: cores.trim() || null, diferenciais: diferenciais.trim() || null, cidade: empresa.cidade }),
      );
      const t = r.vitrine.tema;
      setAp((a) => ({
        ...a,
        cor_primaria: t.corPrimaria,
        cor_fundo: t.corFundo,
        cor_superficie: t.corSuperficie,
        cor_texto: t.corTexto,
        fonte: t.fonte,
        titulo: t.titulo ?? a.titulo,
        mensagem_boas_vindas: t.mensagemBoasVindas ?? a.mensagem_boas_vindas,
      }));
      setSecoes(r.vitrine.secoes);
      toast.success("A Vixe montou a vitrine. Revise na prévia e salve.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar agora.");
    } finally {
      setGerando(false);
    }
  }

  async function enviarLogo(file: File) {
    const r = await enviar(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: `logo-${catalogo.id}` });
    if (r) setAp((a) => ({ ...a, logo_url: r.publicUrl }));
  }

  async function salvar() {
    setSalvando(true);
    const r1 = await executarComToast(salvarAparenciaCatalogo(catalogo.id, ap), { erro: "Erro ao salvar a aparência" });
    const r2 = r1.ok ? await executarComToast(salvarSecoesCatalogo(catalogo.id, secoesLimpas), { erro: "Erro ao salvar as seções" }) : r1;
    setSalvando(false);
    if (r1.ok && r2.ok) {
      toast.success("Vitrine salva");
      router.refresh();
    }
  }

  const cor = (campo: "cor_primaria" | "cor_fundo" | "cor_superficie" | "cor_texto", rotulo: string) => (
    <FormField key={campo} label={rotulo}>
      <div className="flex items-center gap-2">
        <input type="color" value={ap[campo]} onChange={(e) => setAp((a) => ({ ...a, [campo]: e.target.value }))} className="w-9 h-9 rounded-md border border-border shrink-0 cursor-pointer" aria-label={rotulo} />
        <input value={ap[campo]} onChange={(e) => setAp((a) => ({ ...a, [campo]: e.target.value }))} className={`${campoBase} w-full font-mono text-xs`} />
      </div>
    </FormField>
  );

  return (
    <>
      <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Catálogo
      </Link>
      <PageHeader
        title={`Personalizar · ${catalogo.nome}`}
        actions={
          <>
            <a href={`/vitrine/${catalogo.slug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                Ver vitrine <ExternalLink size={13} />
              </Button>
            </a>
            <Button variant="primary" loading={salvando} disabled={!sujo} onClick={salvar}>
              Salvar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Card>
          <Tabs
            tabs={[
              { value: "marca" as const, label: "Cores e marca" },
              { value: "secoes" as const, label: "Seções" },
              { value: "vixe" as const, label: "Montar com a Vixe" },
            ]}
            value={aba}
            onChange={setAba}
            className="mb-4"
          />

          {aba === "marca" && (
            <div className="space-y-1">
              <div className="grid grid-cols-2 gap-3">
                {cor("cor_primaria", "Cor principal")}
                {cor("cor_fundo", "Fundo")}
                {cor("cor_superficie", "Cartões")}
                {cor("cor_texto", "Texto")}
              </div>
              <p className="text-xs text-text-tertiary -mt-1 mb-3">O contraste é corrigido sozinho na vitrine para ficar legível.</p>
              <FormField label="Fonte">
                <select className={inputClass} value={ap.fonte} onChange={(e) => setAp((a) => ({ ...a, fonte: e.target.value as FonteVitrine }))}>
                  {FONTES_VITRINE.map((f) => (
                    <option key={f} value={f}>
                      {ROTULO_FONTE[f]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Logo do catálogo" dica={empresa.logoUrl ? "Sem logo aqui, a vitrine usa o logo da empresa (Configurações → Conta)." : "Opcional."}>
                <div className="flex items-center gap-3">
                  {ap.logo_url ? (
                    <ImagemStorage src={ap.logo_url} alt="" className="w-10 h-10 rounded-md object-contain border border-border shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-md border border-border shrink-0 flex items-center justify-center text-text-tertiary">
                      <Upload size={16} />
                    </div>
                  )}
                  <CampoArquivo onArquivo={enviarLogo} disabled={enviando} />
                  {ap.logo_url && (
                    <button type="button" className="text-xs text-negative hover:underline" onClick={() => setAp((a) => ({ ...a, logo_url: null }))}>
                      Remover
                    </button>
                  )}
                </div>
              </FormField>
              <FormField label="Título da vitrine" dica="Sem título, mostra o nome do catálogo.">
                <input className={inputClass} maxLength={60} value={ap.titulo ?? ""} onChange={(e) => setAp((a) => ({ ...a, titulo: e.target.value || null }))} />
              </FormField>
              <FormField label="Mensagem de boas-vindas">
                <input className={inputClass} maxLength={160} value={ap.mensagem_boas_vindas ?? ""} onChange={(e) => setAp((a) => ({ ...a, mensagem_boas_vindas: e.target.value || null }))} />
              </FormField>
            </div>
          )}

          {aba === "secoes" && <EditorSecoes secoes={secoes} onChange={setSecoes} />}

          {aba === "vixe" &&
            (iaDisponivel ? (
              <div>
                <p className="text-sm text-text-secondary mb-3">Conte sobre a loja e a Vixe sugere cores, fonte e os textos das seções. Nada é salvo sem você clicar em Salvar.</p>
                <FormField label="O que a loja vende">
                  <input className={inputClass} maxLength={200} value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: doces caseiros e bolos de pote" />
                </FormField>
                <FormField label="Para quem (opcional)">
                  <input className={inputClass} maxLength={200} value={publico} onChange={(e) => setPublico(e.target.value)} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Estilo">
                    <select className={inputClass} value={estilo} onChange={(e) => setEstilo(e.target.value as EstiloVitrine)}>
                      {ESTILOS_VITRINE.map((e) => (
                        <option key={e} value={e}>
                          {ROTULO_ESTILO[e]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Cores (opcional)">
                    <input className={inputClass} maxLength={120} value={cores} onChange={(e) => setCores(e.target.value)} placeholder="Ex: marrom e creme" />
                  </FormField>
                </div>
                <FormField label="Diferenciais (só o que for verdade)">
                  <textarea className={`${inputClass} h-20 py-2 resize-y`} maxLength={500} value={diferenciais} onChange={(e) => setDiferenciais(e.target.value)} />
                </FormField>
                <Button variant="primary" className="w-full" loading={gerando} disabled={segmento.trim().length < 2} onClick={gerar}>
                  <Sparkles size={14} /> Montar com a Vixe
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Nenhuma IA disponível. Cadastre a sua em Configurações → IA, ou edite as abas ao lado à mão.</p>
            ))}
        </Card>

        <div className="lg:sticky lg:top-4">
          <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Prévia</div>
          <PreviaVitrine aparencia={ap} secoes={secoesLimpas} nomeCatalogo={catalogo.nome} logoEmpresa={empresa.logoUrl} whatsapp={empresa.whatsapp} />
        </div>
      </div>
    </>
  );
}
