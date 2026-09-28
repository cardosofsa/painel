"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { formatBRL } from "@/lib/format";
import { formatarFaixaLabel } from "@/lib/pricing";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import type { CanalInput, LojaInput, FaixaComissaoInput } from "@/app/(painel)/configuracoes/actions";
import { ICONES_CANAL, type Canal, type Loja } from "@/app/(painel)/configuracoes/ConfiguracoesClient";

/**
 * Modais do domínio de canal de venda: faixas de comissão, o canal em si e a loja.
 *
 * Saíram de ConfiguracoesClient, que tinha 1.174 linhas e seis modais declarados no
 * mesmo módulo. Todos recebem o item por prop e devolvem por  — nenhum toca em
 * estado do pai nem chama Server Action, então o corte não muda comportamento.
 */
export function FaixasModal({
  canal,
  onClose,
  onSave,
  salvando,
}: {
  canal: Canal | null;
  onClose: () => void;
  onSave: (canalId: string, faixas: FaixaComissaoInput[]) => void;
  salvando: boolean;
}) {
  const [faixas, setFaixas] = useState<FaixaComissaoInput[]>(
    () => canal?.faixas.map((f) => ({ preco_min: f.preco_min, preco_max: f.preco_max, comissao_pct: f.comissao_pct, tarifa_fixa: f.tarifa_fixa })) ?? [],
  );

  function atualizar(i: number, campo: keyof FaixaComissaoInput, valor: string) {
    setFaixas((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, [campo]: campo === "preco_max" && valor.trim() === "" ? null : Number(valor) || 0 } : f,
      ),
    );
  }

  function adicionar() {
    setFaixas((prev) => [...prev, { preco_min: 0, preco_max: null, comissao_pct: 0, tarifa_fixa: 0 }]);
  }

  function remover(i: number) {
    setFaixas((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Modal open={!!canal} onClose={onClose} title={canal ? `Faixas de Comissão (${canal.nome})` : ""} width="max-w-xl">
      <p className="text-sm text-text-secondary mb-4">
        Vale para todas as lojas deste canal. Ajuste se a plataforma mudar a tabela oficial.
      </p>
      <div className="space-y-3 mb-4">
        {faixas.map((f, i) => {
          const ultima = i === faixas.length - 1;
          return (
            <div key={i} className="border border-border rounded-md p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {ultima ? (
                  <div className="col-span-2">
                    <label className="text-[10px] text-text-tertiary block mb-1">Faixa de Preço</label>
                    <div className="text-sm text-text-secondary bg-surface-2 rounded-md h-9 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                      Acima de {formatBRL(f.preco_min)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">De (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={f.preco_min}
                        onChange={(e) => atualizar(i, "preco_min", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">Até (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={f.preco_max ?? ""}
                        onChange={(e) => atualizar(i, "preco_max", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-[10px] text-text-tertiary block mb-1">Comissão (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={f.comissao_pct}
                    onChange={(e) => atualizar(i, "comissao_pct", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-tertiary block mb-1">Tarifa Fixa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={f.tarifa_fixa}
                    onChange={(e) => atualizar(i, "tarifa_fixa", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <button onClick={() => remover(i)} className="text-xs text-negative hover:underline">
                Remover faixa
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={adicionar} className="text-sm text-accent hover:underline mb-5">
        + Adicionar Faixa
      </button>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => canal && onSave(canal.id, faixas)} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export function CanalModal({
  open,
  onClose,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dados: CanalInput) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState("");
  const [tipoTaxa, setTipoTaxa] = useState<"fixo" | "faixas">("fixo");
  const [icone, setIcone] = useState("Store");
  const [cor, setCor] = useState("#64748b");

  function salvar() {
    if (!nome.trim()) return;
    onSave({ nome: nome.trim(), tipo_taxa: tipoTaxa, icone, cor });
    setNome("");
    setTipoTaxa("fixo");
    setIcone("Store");
    setCor("#64748b");
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Canal" width="max-w-md">
      <FormField label="Nome do Canal">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: TikTok Shop" />
      </FormField>
      <FormField label="Tipo de Taxa">
        <select className={inputClass} value={tipoTaxa} onChange={(e) => setTipoTaxa(e.target.value as "fixo" | "faixas")}>
          <option value="fixo">Fixo (comissão % + taxa fixa)</option>
          <option value="faixas">Faixas por preço (ex: Shopee)</option>
        </select>
      </FormField>
      <FormField label="Ícone">
        <select className={inputClass} value={icone} onChange={(e) => setIcone(e.target.value)}>
          {Object.keys(ICONES_CANAL).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Cor">
        <input
          type="color"
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          className="h-9 w-16 rounded-md border border-border bg-surface-1 cursor-pointer"
        />
      </FormField>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

export function LojaModal({
  modalLoja,
  onClose,
  onSave,
  salvando,
}: {
  modalLoja: { loja: Loja | null; canal: Canal } | null;
  onClose: () => void;
  onSave: (dados: LojaInput) => void;
  salvando: boolean;
}) {
  const loja = modalLoja?.loja ?? null;
  const canal = modalLoja?.canal;
  const [nome, setNome] = useState(loja?.nome ?? "");
  const [link, setLink] = useState(loja?.link ?? "");
  const [logoPath, setLogoPath] = useState<string | null>(loja?.logo_path ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(loja?.logo_url ?? null);
  const [comissaoPctStr, setComissaoPctStr] = useState(loja?.comissao_pct != null ? String(loja.comissao_pct) : "");
  const [taxaFixaStr, setTaxaFixaStr] = useState(loja?.taxa_fixa != null ? String(loja.taxa_fixa) : "");
  const [taxaExtraValorStr, setTaxaExtraValorStr] = useState(loja?.taxa_extra_valor != null ? String(loja.taxa_extra_valor) : "");
  const [taxaExtraTipo, setTaxaExtraTipo] = useState<"percentual" | "fixo">(loja?.taxa_extra_tipo ?? "percentual");
  const { enviar: enviarLogoArquivo, enviando: enviandoLogo } = useSupabaseUpload("canais-logos");

  async function enviarLogo(file: File) {
    const resultado = await enviarLogoArquivo(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: "loja" });
    if (resultado) {
      setLogoPath(resultado.path);
      setLogoUrl(resultado.publicUrl);
    }
  }

  if (!canal) return null;

  return (
    <Modal open={!!modalLoja} onClose={onClose} title={loja ? `Editar Loja — ${canal.nome}` : `Adicionar Loja — ${canal.nome}`}>
      <FormField label="Nome da Loja">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Minha Loja Oficial" />
      </FormField>
      <FormField label="Logo (opcional)">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <ImagemStorage src={logoUrl} alt={nome} className="w-10 h-10 rounded-md object-cover border border-border" />
          ) : (
            <div className="w-10 h-10 rounded-md bg-surface-2 border border-border" />
          )}
          <input
            type="file"
            accept="image/*"
            disabled={enviandoLogo}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) enviarLogo(file);
              e.target.value = "";
            }}
            className="text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:text-text-primary file:text-sm hover:file:bg-surface-3 disabled:opacity-50"
          />
        </div>
      </FormField>
      <FormField label="Link da Loja (opcional)">
        <input className={inputClass} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </FormField>

      {canal.tipo_taxa === "faixas" ? (
        <div className="mb-4">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Comissão por faixa de preço (compartilhada pelo canal)
          </label>
          <div className="border border-border rounded-md divide-y divide-border text-xs">
            {canal.faixas.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-text-secondary">{formatarFaixaLabel({ min: f.preco_min, max: f.preco_max, comissaoPct: f.comissao_pct, tarifaFixa: f.tarifa_fixa })}</span>
                <span className="text-text-primary">
                  {f.comissao_pct}% + {formatBRL(f.tarifa_fixa)}
                </span>
              </div>
            ))}
            {canal.faixas.length === 0 && <div className="px-3 py-2 text-text-tertiary">Nenhuma faixa cadastrada.</div>}
          </div>
          <p className="text-xs text-text-tertiary mt-1.5">
            Todas as lojas deste canal usam a mesma tabela — edite em &quot;Editar Faixas de Comissão&quot; no
            cabeçalho do canal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FormField label={`Comissão (%) — padrão ${canal.comissao_pct_padrao}%`}>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={comissaoPctStr}
              onChange={(e) => setComissaoPctStr(e.target.value)}
              placeholder={String(canal.comissao_pct_padrao)}
            />
          </FormField>
          <FormField label={`Taxa Fixa (R$) — padrão ${formatBRL(canal.taxa_fixa_padrao)}`}>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={taxaFixaStr}
              onChange={(e) => setTaxaFixaStr(e.target.value)}
              placeholder={String(canal.taxa_fixa_padrao)}
            />
          </FormField>
        </div>
      )}

      <FormField label="Taxa Extra (opcional)">
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={taxaExtraValorStr}
            onChange={(e) => setTaxaExtraValorStr(e.target.value)}
            placeholder="0"
          />
          <select
            value={taxaExtraTipo}
            onChange={(e) => setTaxaExtraTipo(e.target.value as "percentual" | "fixo")}
            className={`${inputClass} w-28`}
          >
            <option value="percentual">%</option>
            <option value="fixo">R$</option>
          </select>
        </div>
      </FormField>

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              canal_id: canal.id,
              nome,
              logo_path: logoPath,
              link: link.trim() || null,
              comissao_pct: comissaoPctStr.trim() !== "" ? Number(comissaoPctStr) : null,
              taxa_fixa: taxaFixaStr.trim() !== "" ? Number(taxaFixaStr) : null,
              taxa_extra_valor: taxaExtraValorStr.trim() !== "" ? Number(taxaExtraValorStr) : null,
              taxa_extra_tipo: taxaExtraValorStr.trim() !== "" ? taxaExtraTipo : null,
            })
          }
          loading={salvando}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
