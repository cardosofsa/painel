"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { variaveisCssVitrine } from "@/lib/cores";
import { classeFonte } from "@/lib/fontes-vitrine";
import { ESTILOS_VITRINE, ROTULO_ESTILO, type EstiloVitrine, type VitrineSugerida } from "@/lib/ia/prompts-vitrine";
import { aplicarVitrineVixe, gerarVitrineVixe, removerSecoesVitrine } from "@/app/(painel)/vixe/actions";
import { DestaqueVitrine, SecoesFinaisVitrine } from "@/components/catalogo/VitrineSecoes";

export interface CatalogoVitrine {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  logoUrl: string | null;
  temSecoes: boolean;
}

/**
 * Vixe Vitrine: cinco perguntas, uma sugestão de tema + seções, prévia com as cores já
 * corrigidas para contraste e "Aplicar". A IA só sugere; nada é gravado sem o clique.
 */
export function VixeVitrine({
  catalogos,
  nomeNegocio,
  cidade,
  whatsapp,
  iaDisponivel,
}: {
  catalogos: CatalogoVitrine[];
  nomeNegocio: string | null;
  cidade: string | null;
  whatsapp: string | null;
  iaDisponivel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [catalogoId, setCatalogoId] = useState(catalogos[0]?.id ?? "");
  const [segmento, setSegmento] = useState("");
  const [publico, setPublico] = useState("");
  const [estilo, setEstilo] = useState<EstiloVitrine>("moderno");
  const [cores, setCores] = useState("");
  const [diferenciais, setDiferenciais] = useState("");
  const [sugestao, setSugestao] = useState<VitrineSugerida | null>(null);
  const [rodape, setRodape] = useState("");

  const catalogo = catalogos.find((c) => c.id === catalogoId) ?? null;

  if (catalogos.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">Crie um catálogo em Catálogo primeiro. Depois a Vixe monta a vitrine dele.</p>
      </Card>
    );
  }

  function gerar() {
    startTransition(async () => {
      try {
        const r = await executar(
          gerarVitrineVixe({
            nomeNegocio,
            segmento,
            publico: publico.trim() || null,
            estilo,
            cores: cores.trim() || null,
            diferenciais: diferenciais.trim() || null,
            cidade,
          }),
        );
        setSugestao(r.vitrine);
        setRodape(r.origem === "propria" ? `Sua IA · ${r.provedorRotulo ?? ""}` : r.limite > 0 ? `${r.usadas}/${r.limite} do teste grátis` : "IA do sistema");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível montar agora.");
      }
    });
  }

  async function aplicar() {
    if (!sugestao || !catalogo) return;
    const ok = await confirm({
      title: "Aplicar na vitrine?",
      message: `As cores, a fonte, o título e as seções de "${catalogo.nome}" serão trocados por estes. O logo continua o mesmo.`,
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    const t = sugestao.tema;
    startTransition(async () => {
      const r = await executarComToast(
        aplicarVitrineVixe(
          catalogo.id,
          {
            cor_primaria: t.corPrimaria,
            cor_fundo: t.corFundo,
            cor_superficie: t.corSuperficie,
            cor_texto: t.corTexto,
            fonte: t.fonte,
            titulo: t.titulo,
            mensagem_boas_vindas: t.mensagemBoasVindas,
          },
          sugestao.secoes,
        ),
        { sucesso: "Vitrine atualizada", erro: "Erro ao aplicar" },
      );
      if (r.ok) router.refresh();
    });
  }

  async function removerSecoes() {
    if (!catalogo) return;
    const ok = await confirm({ title: "Tirar as seções?", message: "Destaque, sobre, diferenciais e chamada saem da vitrine. Cores e logo ficam.", confirmLabel: "Tirar" });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerSecoesVitrine(catalogo.id), { sucesso: "Seções removidas", erro: "Erro ao remover" });
      if (r.ok) router.refresh();
    });
  }

  const tema = sugestao?.tema;
  const estiloPrevia = tema
    ? (variaveisCssVitrine({ corPrimaria: tema.corPrimaria, corFundo: tema.corFundo, corSuperficie: tema.corSuperficie, corTexto: tema.corTexto }) as CSSProperties)
    : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <Card>
        <h3 className="font-semibold text-text-primary mb-1">Conte sobre a loja</h3>
        <p className="text-xs text-text-tertiary mb-3">A Vixe sugere cores, fonte e os textos das seções. Você vê a prévia antes de aplicar.</p>
        <FormField label="Catálogo">
          <select className={inputClass} value={catalogoId} onChange={(e) => setCatalogoId(e.target.value)}>
            {catalogos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="O que a loja vende">
          <input className={inputClass} value={segmento} maxLength={200} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: doces caseiros e bolos de pote" />
        </FormField>
        <FormField label="Para quem (opcional)">
          <input className={inputClass} value={publico} maxLength={200} onChange={(e) => setPublico(e.target.value)} placeholder="Ex: famílias do bairro, encomendas para festas" />
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
            <input className={inputClass} value={cores} maxLength={120} onChange={(e) => setCores(e.target.value)} placeholder="Ex: marrom e creme" />
          </FormField>
        </div>
        <FormField label="Diferenciais (opcional)">
          <textarea
            className={`${inputClass} h-20 py-2 resize-y`}
            value={diferenciais}
            maxLength={500}
            onChange={(e) => setDiferenciais(e.target.value)}
            placeholder="Só o que é verdade. Ex: receita de família, entrega no bairro, aceita encomenda"
          />
        </FormField>
        <p className="text-xs text-text-tertiary -mt-1 mb-3">A Vixe não inventa diferencial: sem isso, a seção fica de fora.</p>
        {iaDisponivel ? (
          <Button variant="primary" className="w-full" loading={pending && !sugestao} disabled={segmento.trim().length < 2} onClick={gerar}>
            <Sparkles size={14} /> {sugestao ? "Montar de novo" : "Montar vitrine com a Vixe"}
          </Button>
        ) : (
          <p className="text-sm text-text-secondary">Nenhuma IA disponível. Cadastre a sua em Configurações → IA.</p>
        )}
        {catalogo && (
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <a href={`/vitrine/${catalogo.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              Ver vitrine atual <ExternalLink size={13} />
            </a>
            {catalogo.temSecoes && (
              <button onClick={removerSecoes} disabled={pending} className="text-negative hover:underline">
                Tirar seções da vitrine
              </button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-text-primary">Prévia</h3>
          {sugestao && (
            <Button variant="primary" loading={pending} onClick={aplicar}>
              Aplicar na vitrine
            </Button>
          )}
        </div>
        {!sugestao || !tema ? (
          <p className="text-sm text-text-tertiary">Responda ao lado e a prévia aparece aqui, já com as cores ajustadas para leitura.</p>
        ) : (
          <>
            <div style={estiloPrevia} className={`${classeFonte(tema.fonte)} rounded-lg border border-border bg-background p-4 max-h-[640px] overflow-y-auto`}>
              <h1 className="text-xl font-semibold text-text-primary">{tema.titulo || catalogo?.nome}</h1>
              {tema.mensagemBoasVindas && <p className="text-sm text-text-secondary mt-1 mb-4">{tema.mensagemBoasVindas}</p>}
              <DestaqueVitrine secoes={sugestao.secoes} />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg bg-surface-1 border border-border overflow-hidden">
                    <div className="aspect-square bg-surface-2" />
                    <div className="p-2">
                      <div className="h-2.5 w-3/4 rounded bg-surface-3 mb-1.5" />
                      <div className="text-xs font-mono text-accent font-semibold">R$ 00,00</div>
                    </div>
                  </div>
                ))}
              </div>
              <SecoesFinaisVitrine secoes={sugestao.secoes} whatsapp={whatsapp} />
            </div>
            <p className="text-xs text-text-tertiary mt-2 text-right">{rodape}</p>
          </>
        )}
      </Card>
      {ConfirmDialog}
    </div>
  );
}
