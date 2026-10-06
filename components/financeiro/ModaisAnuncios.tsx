"use client";

import { useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { formatBRL, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { lerPlanilha } from "@/lib/importar";
import { executarComToast } from "@/lib/acao-cliente";
import { interpretarRelatorioAnuncios, type RelatorioAnuncios } from "@/lib/marketplace/relatorios-financeiros";
import { salvarGastosAnuncios } from "@/app/(painel)/financeiro/resultado-actions";

type Loja = { id: string; nome: string; canal: string };

function inicioDoMes(hoje: string) {
  return `${hoje.slice(0, 8)}01`;
}

function SeletorLoja({ lojas, valor, onChange }: { lojas: Loja[]; valor: string; onChange: (id: string) => void }) {
  if (lojas.length === 0) return null;
  return (
    <FormField label="Loja" dica="Opcional: deixa o gasto ligado à loja.">
      <select className={inputClass} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas / não sei</option>
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.canal} · {l.nome}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/**
 * Importar o relatório do Shopee Ads (.csv ou .xlsx). O período vem do cabeçalho do
 * relatório quando dá; senão a pessoa informa. Reimportar o mesmo período substitui.
 */
export function ImportarAnunciosModal({ lojas, onClose }: { lojas: Loja[]; onClose: () => void }) {
  const hoje = hojeIsoLocal();
  const [rel, setRel] = useState<RelatorioAnuncios | null>(null);
  const [lendo, setLendo] = useState(false);
  const [inicio, setInicio] = useState(inicioDoMes(hoje));
  const [fim, setFim] = useState(hoje);
  const [lojaId, setLojaId] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function ler(file: File) {
    setLendo(true);
    try {
      const r = interpretarRelatorioAnuncios(await lerPlanilha(file));
      setRel(r);
      if (r.periodo) {
        setInicio(r.periodo.inicio);
        setFim(r.periodo.fim);
      }
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    if (!rel || rel.linhas.length === 0) return;
    setSalvando(true);
    const loja = lojas.find((l) => l.id === lojaId);
    const r = await executarComToast(
      salvarGastosAnuncios({ periodo_inicio: inicio, periodo_fim: fim, loja_id: lojaId || null, canal: loja?.canal ?? "Shopee", origem: "shopee_ads", linhas: rel.linhas }),
      { sucesso: `Gasto de ${formatBRL(rel.total)} importado`, erro: "Erro ao importar" },
    );
    setSalvando(false);
    if (r.ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Importar relatório do Shopee Ads" width="max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">No Shopee Ads, abra Relatórios, escolha o período e exporte. Pode ser .csv ou .xlsx.</p>
        <CampoArquivo onArquivo={ler} disabled={lendo} rotulo={lendo ? "Lendo…" : "Escolher relatório"} aceita=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        {rel && (
          <>
            {rel.erros.map((e) => (
              <p key={`${e.linha}-${e.mensagem}`} className="text-xs text-negative">
                Linha {e.linha}: {e.mensagem}
              </p>
            ))}
            {rel.linhas.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Início do período">
                    <input type="date" className={inputClass} value={inicio} onChange={(e) => setInicio(e.target.value)} />
                  </FormField>
                  <FormField label="Fim do período">
                    <input type="date" className={inputClass} value={fim} onChange={(e) => setFim(e.target.value)} />
                  </FormField>
                </div>
                {!rel.periodo && <p className="text-xs text-text-secondary">Não achei o período no arquivo: confira as datas acima.</p>}
                <SeletorLoja lojas={lojas} valor={lojaId} onChange={setLojaId} />
                <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border text-sm">
                  {rel.linhas.map((l) => (
                    <div key={l.campanha} className="flex justify-between gap-3 px-3 py-1.5">
                      <span className="truncate text-text-primary">{l.campanha}</span>
                      <span className="font-mono text-text-secondary shrink-0">{formatBRL(l.valor)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-text-primary">
                  {rel.linhas.length} anúncio(s) · total <strong>{formatBRL(rel.total)}</strong>
                </p>
              </>
            )}
          </>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={!rel || rel.linhas.length === 0 || !inicio || !fim || fim < inicio}>
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Lançar à mão o gasto de outra plataforma (Mercado Livre Ads, Instagram, Google…). */
export function LancarAnuncioModal({ lojas, onClose }: { lojas: Loja[]; onClose: () => void }) {
  const hoje = hojeIsoLocal();
  const [inicio, setInicio] = useState(inicioDoMes(hoje));
  const [fim, setFim] = useState(hoje);
  const [canal, setCanal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [lojaId, setLojaId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const v = numeroOuNulo(valor);

  async function salvar() {
    if (v === null || v <= 0 || !canal.trim()) return;
    setSalvando(true);
    const r = await executarComToast(
      salvarGastosAnuncios({
        periodo_inicio: inicio,
        periodo_fim: fim,
        loja_id: lojaId || null,
        canal: canal.trim(),
        origem: "manual",
        linhas: [{ campanha: descricao.trim(), sku: null, valor: v, pedidos: null, vendas: null }],
      }),
      { sucesso: "Gasto lançado", erro: "Erro ao lançar" },
    );
    setSalvando(false);
    if (r.ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title="Lançar gasto com anúncio">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Início">
            <input type="date" className={inputClass} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </FormField>
          <FormField label="Fim">
            <input type="date" className={inputClass} value={fim} onChange={(e) => setFim(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Onde anunciou">
          <input className={inputClass} value={canal} onChange={(e) => setCanal(e.target.value)} placeholder="ex.: Mercado Livre Ads, Instagram" list="canais-anuncio" />
          <datalist id="canais-anuncio">
            {["Shopee Ads", "Mercado Livre Ads", "Instagram", "Facebook", "Google", "TikTok"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Descrição (opcional)">
          <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: campanha Dia das Crianças" />
        </FormField>
        <FormField label="Valor gasto (R$)">
          <input type="text" inputMode="decimal" className={inputClass} value={valor} onChange={(e) => setValor(e.target.value)} />
        </FormField>
        <SeletorLoja lojas={lojas} valor={lojaId} onChange={setLojaId} />
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={v === null || v <= 0 || !canal.trim() || fim < inicio}>
            Lançar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
