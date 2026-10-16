"use client";

import { useMemo, useState, useTransition } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatarDataHora } from "@/lib/format";
import { camposDescartados, FICHA_PADRAO, fichaParaForm, formParaFicha, ROTULO_CAMPO, ROTULO_POSICAO_LOGO, ROTULO_PESSOAS, ROTULO_TIPO_IMAGEM, type FichaForm, type TipoImagemMarca } from "@/lib/marca/ficha";
import type { FichaSalva } from "@/lib/marca/tipos";
import { TIPOS_IMAGEM_MARCA, POSICOES_LOGO } from "@/lib/validacao";
import { ativarVersaoFichaMarca, salvarFichaMarca } from "@/app/(painel)/produtos/marca/actions";

const ROTULO_ORIGEM = { usuario: "Você", ia_capas: "IA, pelas suas capas", ajuste_ia: "IA, ajuste" } as const;

const TEXTOS: { campo: keyof FichaForm; dica?: string; longo?: boolean }[] = [
  { campo: "fundo", dica: "Ex.: creme claro com folhagem desfocada" },
  { campo: "luz", dica: "Ex.: natural e suave" },
  { campo: "enquadramento", dica: "Ex.: produto centralizado, grande" },
  { campo: "tipografia", dica: "Ex.: serifada condensada, em negrito" },
  { campo: "faixaInferior", dica: "Ex.: faixa verde-escura com texto curto" },
  { campo: "tom", dica: "Ex.: profissional e acolhedor" },
];

/** Os campos da ficha. `key` no consumidor: trocar de tipo ou de versão ativa remonta com os valores novos. */
function Campos({ inicial, onSalvar, pending }: { inicial: FichaForm; onSalvar: (form: FichaForm, nota: string) => void; pending: boolean }) {
  const [form, setForm] = useState<FichaForm>(inicial);
  const [nota, setNota] = useState("");
  const set = (campo: keyof FichaForm, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));
  const descartados = useMemo(() => camposDescartados(form), [form]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {TEXTOS.map(({ campo, dica }) => (
          <FormField key={campo} label={ROTULO_CAMPO[campo]} dica={dica}>
            <input className={inputClass} value={form[campo]} maxLength={160} onChange={(e) => set(campo, e.target.value)} />
          </FormField>
        ))}
        <FormField label={ROTULO_CAMPO.areaProdutoMinPct} dica="De 10 a 100">
          <input className={inputClass} inputMode="decimal" value={form.areaProdutoMinPct} onChange={(e) => set("areaProdutoMinPct", e.target.value)} />
        </FormField>
        <FormField label={ROTULO_CAMPO.tituloMaxPalavras} dica="De 1 a 12">
          <input className={inputClass} inputMode="numeric" value={form.tituloMaxPalavras} onChange={(e) => set("tituloMaxPalavras", e.target.value)} />
        </FormField>
        <FormField label={ROTULO_CAMPO.logoPosicao}>
          <select className={inputClass} value={form.logoPosicao} onChange={(e) => set("logoPosicao", e.target.value)}>
            <option value="">Não definir</option>
            {POSICOES_LOGO.map((p) => (
              <option key={p} value={p}>
                {ROTULO_POSICAO_LOGO[p]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={ROTULO_CAMPO.logoLarguraPct} dica="De 3 a 25">
          <input className={inputClass} inputMode="decimal" value={form.logoLarguraPct} onChange={(e) => set("logoLarguraPct", e.target.value)} />
        </FormField>
        <FormField label={ROTULO_CAMPO.pessoas}>
          <select className={inputClass} value={form.pessoas} onChange={(e) => set("pessoas", e.target.value)}>
            <option value="">Não definir</option>
            {(Object.keys(ROTULO_PESSOAS) as (keyof typeof ROTULO_PESSOAS)[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PESSOAS[p]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={ROTULO_CAMPO.numeroImagens} dica="Em branco = a IA pergunta a cada anúncio">
          <input className={inputClass} inputMode="numeric" value={form.numeroImagens} onChange={(e) => set("numeroImagens", e.target.value)} />
        </FormField>
        <FormField label={ROTULO_CAMPO.paleta} dica="Cores no formato #RRGGBB, separadas por vírgula">
          <input className={inputClass} value={form.paleta} onChange={(e) => set("paleta", e.target.value)} placeholder="#1F3D2B, #F5EFE0" />
        </FormField>
        <FormField label={ROTULO_CAMPO.selos} dica="Até 4, separados por vírgula">
          <input className={inputClass} value={form.selos} onChange={(e) => set("selos", e.target.value)} />
        </FormField>
      </div>
      <FormField label={ROTULO_CAMPO.proibicoes} dica="Separe por vírgula. Ex.: pessoas, preço, moldura fina">
        <input className={inputClass} value={form.proibicoes} onChange={(e) => set("proibicoes", e.target.value)} />
      </FormField>
      <FormField label={ROTULO_CAMPO.observacoes}>
        <textarea className={`${inputClass} h-20 py-2`} value={form.observacoes} maxLength={400} onChange={(e) => set("observacoes", e.target.value)} />
      </FormField>

      {descartados.length > 0 && (
        <p className="text-xs text-negative mb-3" role="alert">
          Fora do formato e não serão salvos: {descartados.map((c) => ROTULO_CAMPO[c]).join(", ")}.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <FormField label="O que mudou? (opcional)">
            <input className={inputClass} value={nota} maxLength={240} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: fundo mais claro" />
          </FormField>
        </div>
        <Button variant="primary" onClick={() => onSalvar(form, nota)} loading={pending} disabled={pending} className="mb-4">
          Salvar nova versão
        </Button>
      </div>
    </>
  );
}

/**
 * A Ficha de Direção de Arte de um perfil, por tipo de imagem. Cada salvamento cria uma versão
 * nova (a anterior fica guardada); dá para voltar a qualquer uma.
 */
export function FichaEditor({ perfilId, fichas }: { perfilId: string; fichas: FichaSalva[] }) {
  const [tipo, setTipo] = useState<TipoImagemMarca>("capa_1");
  const [pending, startTransition] = useTransition();
  const doTipo = fichas.filter((f) => f.perfil_id === perfilId && f.tipo_imagem === tipo).sort((a, b) => b.versao - a.versao);
  const ativa = doTipo.find((f) => f.ativa) ?? null;
  const base = ativa?.dados ?? (tipo === "geral" ? FICHA_PADRAO : {});

  function salvar(form: FichaForm, nota: string) {
    startTransition(async () => {
      await executarComToast(
        salvarFichaMarca({ perfil_id: perfilId, tipo_imagem: tipo, dados: formParaFicha(form), origem: "usuario", nota: nota.trim() || null }),
        { sucesso: "Nova versão salva", erro: "Não foi possível salvar a ficha." },
      );
    });
  }

  function voltar(id: string) {
    startTransition(async () => {
      await executarComToast(ativarVersaoFichaMarca(id), { sucesso: "Versão reativada", erro: "Não foi possível voltar a esta versão." });
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ficha de Direção de Arte</CardTitle>
          <CardSubtitle>O visual que a IA segue ao criar imagens. Cada tipo de imagem tem a sua ficha, com histórico.</CardSubtitle>
        </div>
      </CardHeader>

      <FormField label="Tipo de imagem">
        <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoImagemMarca)}>
          {TIPOS_IMAGEM_MARCA.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_IMAGEM[t]}
              {fichas.some((f) => f.perfil_id === perfilId && f.tipo_imagem === t && f.ativa) ? " ✓" : ""}
            </option>
          ))}
        </select>
      </FormField>

      <p className="text-xs text-text-tertiary mb-3">{ativa ? `Versão ativa: ${ativa.versao}` : "Ainda sem ficha para este tipo."}</p>

      <Campos key={`${tipo}-${ativa?.id ?? "nenhuma"}`} inicial={fichaParaForm(base)} onSalvar={salvar} pending={pending} />

      {doTipo.length > 0 && (
        <section className="mt-4 border-t border-border pt-3">
          <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary mb-2">
            <History size={12} aria-hidden /> Versões
          </h4>
          <ul className="space-y-1.5 text-sm">
            {doTipo.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-text-primary">
                  v{f.versao} <span className="text-text-tertiary">· {formatarDataHora(f.criado_em)} · {ROTULO_ORIGEM[f.origem]}</span>
                  {f.nota && <span className="text-text-secondary"> — {f.nota}</span>}
                </span>
                {f.ativa ? (
                  <span className="text-xs font-medium text-positive">Ativa</span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => voltar(f.id)} disabled={pending}>
                    Voltar para esta
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}
