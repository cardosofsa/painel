"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { formatBRL } from "@/lib/format";
import { formatarFaixaLabel } from "@/lib/pricing";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import type { CanalInput, LojaInput, FaixaComissaoInput, LimitesCanalInput } from "@/app/(painel)/configuracoes/actions";
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
  const [faixasIniciais] = useState(faixas);
  const sujo = useFormularioSujo(faixas, faixasIniciais);

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
    <Modal open={!!canal} onClose={onClose} title={canal ? `Faixas de Comissão (${canal.nome})` : ""} width="max-w-xl" sujo={sujo}>
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
                    <label className="text-xs text-text-tertiary block mb-1">Faixa de Preço</label>
                    <div className="text-sm text-text-secondary bg-surface-2 rounded-md h-9 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                      Acima de {formatBRL(f.preco_min)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-text-tertiary block mb-1">De (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={f.preco_min}
                        onChange={(e) => atualizar(i, "preco_min", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-tertiary block mb-1">Até (R$)</label>
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
                  <label className="text-xs text-text-tertiary block mb-1">Comissão (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={f.comissao_pct}
                    onChange={(e) => atualizar(i, "comissao_pct", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-tertiary block mb-1">Tarifa Fixa (R$)</label>
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
  const sujo = useFormularioSujo(
    { nome, tipoTaxa, icone, cor },
    { nome: "", tipoTaxa: "fixo", icone: "Store", cor: "#64748b" },
  );

  function salvar() {
    if (!nome.trim()) return;
    onSave({ nome: nome.trim(), tipo_taxa: tipoTaxa, icone, cor });
    setNome("");
    setTipoTaxa("fixo");
    setIcone("Store");
    setCor("#64748b");
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Canal" width="max-w-md" sujo={sujo}>
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
  // 0089: só aparece para loja já salva e com a migração aplicada.
  const diasOriginal = loja?.prazo_liberacao ?? null;
  const [diasStr, setDiasStr] = useState(diasOriginal !== null ? String(diasOriginal) : "");
  const { enviar: enviarLogoArquivo, enviando: enviandoLogo } = useSupabaseUpload("canais-logos");
  const [inicial] = useState({
    nome, link, logoPath, comissaoPctStr, taxaFixaStr, taxaExtraValorStr, taxaExtraTipo, diasStr,
  });
  const sujo = useFormularioSujo(
    { nome, link, logoPath, comissaoPctStr, taxaFixaStr, taxaExtraValorStr, taxaExtraTipo, diasStr },
    inicial,
  );

  async function enviarLogo(file: File) {
    const resultado = await enviarLogoArquivo(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: "loja" });
    if (resultado) {
      setLogoPath(resultado.path);
      setLogoUrl(resultado.publicUrl);
    }
  }

  if (!canal) return null;

  return (
    <Modal open={!!modalLoja} onClose={onClose} title={loja ? `Editar Loja — ${canal.nome}` : `Adicionar Loja — ${canal.nome}`} sujo={sujo}>
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
          <CampoArquivo onArquivo={enviarLogo} disabled={enviandoLogo} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {diasOriginal !== null && (
        <FormField label="Dias para a plataforma liberar o repasse">
          <input type="number" min="0" max="60" step="1" className={inputClass} value={diasStr} onChange={(e) => setDiasStr(e.target.value)} placeholder="7" />
          <p className="mt-1 text-xs text-text-tertiary">Depois que o pedido conclui. Usado só para prever quando o dinheiro entra no saldo projetado.</p>
        </FormField>
      )}

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
              ...(diasOriginal !== null && diasStr.trim() !== "" && Number(diasStr) !== diasOriginal ? { dias_liberacao_repasse: Number(diasStr) } : {}),
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

/** Campo numérico opcional: vazio = null (sem limite próprio). */
function lerLimite(valor: string): number | null {
  const n = Number(valor);
  return valor.trim() === "" || !Number.isFinite(n) ? null : Math.floor(n);
}

/**
 * Limites de título e descrição que a IA respeita neste canal (0037). Editáveis porque as
 * plataformas mudam a regra sem avisar.
 */
export function LimitesTextoModal({
  canal,
  onClose,
  onSave,
  salvando,
}: {
  canal: Canal | null;
  onClose: () => void;
  onSave: (canalId: string, dados: LimitesCanalInput) => void;
  salvando: boolean;
}) {
  const inicial = { titulo: canal?.limite_titulo?.toString() ?? "", descricao: canal?.limite_descricao?.toString() ?? "" };
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const sujo = useFormularioSujo({ titulo, descricao }, inicial);

  return (
    <Modal open={!!canal} onClose={onClose} title={canal ? `Limites de texto (${canal.nome})` : ""} width="max-w-md" sujo={sujo}>
      <p className="text-sm text-text-secondary mb-4">
        Quantos caracteres a plataforma aceita. A IA gera títulos e descrições dentro desse limite. Deixe em branco para usar o
        teto do sistema (título 200, descrição 5.000).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Título (20 a 200)">
          <input type="number" min={20} max={200} className={inputClass} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </FormField>
        <FormField label="Descrição (100 a 10.000)">
          <input
            type="number"
            min={100}
            max={10000}
            className={inputClass}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </FormField>
      </div>
      <p className="text-xs text-text-tertiary mt-1">
        Referência em set/2026: Shopee título 100 e descrição 5.000; Mercado Livre título 60 e descrição 10.000. Confira na
        plataforma se mudou.
      </p>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          loading={salvando}
          onClick={() => canal && onSave(canal.id, { limite_titulo: lerLimite(titulo), limite_descricao: lerLimite(descricao) })}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
