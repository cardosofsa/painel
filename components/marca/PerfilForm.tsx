"use client";

import { useId, useState, useTransition } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { FormField, inputClass } from "@/components/ui/Modal";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { executarComToast } from "@/lib/acao-cliente";
import { listaDePlataformas, regrasDaPlataforma, type PlataformaMarcaId } from "@/lib/marca/plataformas";
import { PRESETS, termosDoPerfil, type GravidadeTermo } from "@/lib/conformidade/termos";
import { urlPublicaImagem, type LojaParaMarca, type PerfilMarca } from "@/lib/marca/tipos";
import { removerPerfilMarca, salvarPerfilMarca } from "@/app/(painel)/produtos/marca/actions";

const MAX_REFERENCIAS = 8;
const PLATAFORMAS = listaDePlataformas();

type LojaComPlataforma = LojaParaMarca & { plataforma: PlataformaMarcaId | null };

/**
 * Perfil de marca. A primeira pergunta é a PLATAFORMA; o nicho é um texto livre e opcional
 * (nada no sistema depende dele), e as imagens são enviadas aqui, na hora, para cada perfil.
 * `key` no consumidor: trocar de perfil remonta o formulário com os valores do novo.
 */
export function PerfilForm({
  perfil,
  lojas,
  onSalvo,
  onRemovido,
}: {
  perfil: PerfilMarca | null;
  lojas: LojaComPlataforma[];
  onSalvo: (id: string) => void;
  onRemovido: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { enviar, enviando } = useSupabaseUpload("produtos");
  const { confirm, ConfirmDialog } = useConfirm();

  const [plataforma, setPlataforma] = useState<PlataformaMarcaId>(perfil?.plataforma ?? "shopee");
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [lojaId, setLojaId] = useState(perfil?.loja_id ?? "");
  const [nicho, setNicho] = useState(perfil?.nicho ?? "");
  const [link, setLink] = useState(perfil?.link_loja ?? "");
  const [logo, setLogo] = useState<string | null>(perfil?.logo_path ?? null);
  const [referencias, setReferencias] = useState<string[]>(perfil?.referencias ?? []);
  const [termos, setTermos] = useState<string[]>(perfil?.termos_proibidos ?? []);
  const inicial = termosDoPerfil(perfil);
  const [bloqueados, setBloqueados] = useState<string[]>(inicial.bloquear);
  const [presets, setPresets] = useState<string[]>(inicial.presets);
  const [gravidade, setGravidade] = useState<GravidadeTermo>(inicial.presetsGravidade);

  const regras = regrasDaPlataforma(plataforma);

  function escolherLoja(id: string) {
    setLojaId(id);
    const l = lojas.find((x) => x.id === id);
    if (!l) return;
    if (!nome.trim()) setNome(l.nome);
    if (l.plataforma) setPlataforma(l.plataforma);
  }

  async function enviarLogo(file: File | undefined) {
    if (!file) return;
    const r = await enviar(file, { maxSizeMb: 2, tiposAceitos: ["image/"], prefixo: "marca-logo" });
    if (r) setLogo(r.path);
  }

  async function enviarCapas(files: FileList | null) {
    if (!files) return;
    const livres = MAX_REFERENCIAS - referencias.length;
    for (const file of Array.from(files).slice(0, Math.max(0, livres))) {
      const r = await enviar(file, { maxSizeMb: 5, tiposAceitos: ["image/"], prefixo: "marca-capa" });
      if (r) setReferencias((atual) => (atual.length < MAX_REFERENCIAS ? [...atual, r.path] : atual));
    }
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(
        salvarPerfilMarca({
          id: perfil?.id ?? null,
          nome,
          plataforma,
          loja_id: lojaId || null,
          nicho: nicho.trim() || null,
          link_loja: link.trim() || null,
          logo_path: logo,
          referencias,
          termos_proibidos: termos,
          presets,
          presets_gravidade: gravidade,
          termos_bloqueados: bloqueados,
        }),
        { sucesso: "Perfil salvo", erro: "Não foi possível salvar o perfil." },
      );
      if (r.ok) onSalvo(r.dado.id);
    });
  }

  async function remover() {
    if (!perfil) return;
    const ok = await confirm({ title: "Remover este perfil?", message: "As fichas e a memória deste perfil também serão apagadas. As imagens enviadas continuam guardadas." });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(removerPerfilMarca(perfil.id), { sucesso: "Perfil removido", erro: "Não foi possível remover." });
      if (r.ok) onRemovido();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{perfil ? "Perfil da loja" : "Novo perfil"}</CardTitle>
          <CardSubtitle>Comece pela plataforma. O resto é opcional e você muda quando quiser.</CardSubtitle>
        </div>
      </CardHeader>

      <FormField label="1. Em qual plataforma você vende?" dica={regras.notas.join(" ")}>
        <ChipRow>
          {PLATAFORMAS.map((p) => (
            <Chip key={p.id} ativo={plataforma === p.id} onClick={() => setPlataforma(p.id)}>
              {p.nome}
            </Chip>
          ))}
        </ChipRow>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Nome do perfil">
          <input className={inputClass} value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Minha loja principal" />
        </FormField>
        {lojas.length > 0 && (
          <FormField label="Loja do Painel (opcional)" dica="Liga este perfil a uma loja já conectada.">
            <select className={inputClass} value={lojaId} onChange={(e) => escolherLoja(e.target.value)}>
              <option value="">Nenhuma</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                  {l.canal ? ` · ${l.canal}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </div>

      <FormField label="2. O que você vende? (opcional)" dica="Texto livre, só para a IA entender o contexto. Pode mudar a qualquer momento.">
        <input className={inputClass} value={nicho} maxLength={120} onChange={(e) => setNicho(e.target.value)} placeholder="Ex.: bolsas de couro, ferramentas, brinquedos…" />
      </FormField>

      <FormField label="3. Link da sua loja (opcional)" dica="Fica guardado como referência. A IA não consegue abrir páginas de marketplace sozinha: para ela aprender o visual, envie as capas abaixo.">
        <input className={inputClass} type="url" value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 mb-4">
        <div>
          <span className="block text-xs font-medium text-text-secondary mb-1.5">Logo (opcional)</span>
          {logo ? (
            <div className="relative w-24">
              <ImagemStorage src={urlPublicaImagem(logo)} alt="Logo" className="h-24 w-24 rounded-md border border-border object-contain bg-surface-2" />
              <button type="button" aria-label="Remover logo" onClick={() => setLogo(null)} className="absolute -top-2 -right-2 rounded-full bg-surface-1 border border-border p-1 text-text-secondary hover:text-text-primary">
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-text-secondary hover:bg-surface-2">
              <ImagePlus size={18} aria-hidden /> Enviar
              <input type="file" accept="image/*" className="sr-only" disabled={enviando} onChange={(e) => enviarLogo(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <div>
          <span className="block text-xs font-medium text-text-secondary mb-1.5">
            Capas de referência ({referencias.length}/{MAX_REFERENCIAS})
          </span>
          <div className="flex flex-wrap gap-2">
            {referencias.map((r) => (
              <div key={r} className="relative">
                <ImagemStorage src={urlPublicaImagem(r)} alt="Capa de referência" className="h-24 w-24 rounded-md border border-border object-cover bg-surface-2" />
                <button type="button" aria-label="Remover capa" onClick={() => setReferencias((a) => a.filter((x) => x !== r))} className="absolute -top-2 -right-2 rounded-full bg-surface-1 border border-border p-1 text-text-secondary hover:text-text-primary">
                  <X size={12} />
                </button>
              </div>
            ))}
            {referencias.length < MAX_REFERENCIAS && (
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-text-secondary hover:bg-surface-2">
                <ImagePlus size={18} aria-hidden /> {enviando ? "Enviando…" : "Enviar"}
                <input type="file" accept="image/*" multiple className="sr-only" disabled={enviando} onChange={(e) => enviarCapas(e.target.files)} />
              </label>
            )}
          </div>
          <p className="text-xs text-text-tertiary mt-1.5">Envie de 3 a 6 capas de anúncios seus. É daqui que a IA aprende o seu padrão.</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-border">
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-sm font-semibold text-text-primary">Termos que você não quer ver</h3>
          <p className="text-xs text-text-secondary mt-0.5">Além das regras gerais de marketplace (contato, link, promoção na imagem), que sempre valem. Conferidos no título, na descrição e nos textos da capa.</p>
        </div>
        <ListaTermos
          titulo="Bloqueiam"
          dica="Título ou descrição com eles não é salvo no anúncio nem enviado à Shopee."
          termos={bloqueados}
          onTermos={setBloqueados}
          tom="negative"
        />
        <ListaTermos titulo="Pedem revisão" dica="Aparecem como aviso. Você decide se mantém." termos={termos} onTermos={setTermos} tom="neutro" />
        {PRESETS.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <span className="block text-xs font-medium text-text-secondary mb-2">Conjuntos prontos (ligue o que faz sentido para o que você vende)</span>
            <div className="space-y-2">
              {PRESETS.map((p) => {
                const ligado = presets.includes(p.id);
                return (
                  <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors duration-[--duracao-rapida] ${ligado ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={ligado} onChange={() => setPresets((a) => (ligado ? a.filter((x) => x !== p.id) : [...a, p.id]))} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">{p.nome}</span>
                      <span className="block text-xs text-text-secondary">{p.descricao} {p.termos.length} termos, como “{p.termos.slice(0, 3).join("”, “")}”.</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {presets.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-secondary">Os termos dos conjuntos ligados:</span>
                <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Gravidade dos conjuntos ligados">
                  {(
                    [
                      ["revisar", "Pedem revisão"],
                      ["bloquear", "Bloqueiam"],
                    ] as const
                  ).map(([id, rotulo]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={gravidade === id}
                      onClick={() => setGravidade(id)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-[--duracao-rapida] ${gravidade === id ? "bg-surface-1 text-text-primary shadow-elev-1" : "text-text-secondary hover:text-text-primary"}`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="primary" onClick={salvar} loading={pending} disabled={pending || enviando || nome.trim().length === 0}>
          {perfil ? "Salvar perfil" : "Criar perfil"}
        </Button>
        {perfil && (
          <Button variant="ghost" onClick={remover} disabled={pending}>
            <Trash2 size={14} /> Remover perfil
          </Button>
        )}
      </div>
      {ConfirmDialog}
    </Card>
  );
}

/** Uma lista de termos do perfil: campo para digitar (Enter adiciona) e as etiquetas com remover. */
function ListaTermos({ titulo, dica, termos, onTermos, tom }: { titulo: string; dica: string; termos: string[]; onTermos: (f: (a: string[]) => string[]) => void; tom: "negative" | "neutro" }) {
  const [novo, setNovo] = useState("");
  const id = useId();
  function adicionar() {
    const t = novo.trim();
    if (t.length < 2) return;
    onTermos((a) => (a.some((x) => x.toLowerCase() === t.toLowerCase()) || a.length >= 100 ? a : [...a, t]));
    setNovo("");
  }
  return (
    <div className="border-t border-border px-4 py-3">
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <span className={`h-2 w-2 rounded-full ${tom === "negative" ? "bg-negative" : "bg-text-tertiary"}`} aria-hidden="true" />
        {titulo}
        <span className="font-normal text-text-tertiary">· {dica}</span>
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          className={inputClass}
          value={novo}
          maxLength={60}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Digite e tecle Enter"
        />
        <Button type="button" variant="secondary" onClick={adicionar} disabled={novo.trim().length < 2}>
          <Plus size={14} aria-hidden /> Adicionar
        </Button>
      </div>
      {termos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {termos.map((t) => (
            <span key={t} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-text-primary ${tom === "negative" ? "border-negative bg-negative-soft" : "border-border bg-surface-2"}`}>
              {t}
              <button type="button" aria-label={`Remover ${t}`} onClick={() => onTermos((a) => a.filter((x) => x !== t))} className="text-text-secondary hover:text-text-primary">
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
