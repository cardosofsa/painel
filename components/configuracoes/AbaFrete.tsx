"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import type { Cotacao } from "@/lib/frete/tipos";
import { desconectarFrete, salvarFrete, testarFrete } from "@/app/(painel)/configuracoes/frete-actions";

export interface FreteConfig {
  conectado: boolean;
  ambiente: "sandbox" | "producao";
  cep_origem: string;
  servicos: number[];
  acrescimo: number;
  frete_gratis_acima: number | null;
  na_vitrine: boolean;
}

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(",", ".")) || 0));

/**
 * Aba "Frete": conecta o Melhor Envio (token cifrado no servidor), CEP de origem e regras.
 * Cotação na vitrine, no PDV e na compra de etiqueta em Vendas usam esta configuração.
 */
export function AbaFrete({ frete, cofreOk, cepSugerido }: { frete: FreteConfig | null; cofreOk: boolean; cepSugerido: string }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [token, setToken] = useState("");
  const [ambiente, setAmbiente] = useState<FreteConfig["ambiente"]>(frete?.ambiente ?? "producao");
  const [cep, setCep] = useState(frete?.cep_origem || cepSugerido);
  const [servicos, setServicos] = useState<number[]>(frete?.servicos ?? []);
  const [acrescimo, setAcrescimo] = useState<number | null>(frete?.acrescimo ?? 0);
  const [gratis, setGratis] = useState<number | null>(frete?.frete_gratis_acima ?? null);
  const [naVitrine, setNaVitrine] = useState(frete?.na_vitrine ?? false);
  const [cepTeste, setCepTeste] = useState("");
  const [cotacoes, setCotacoes] = useState<Cotacao[] | null>(null);

  if (frete === null) {
    return (
      <Card className="text-sm text-text-secondary">
        O frete precisa da migração <span className="font-mono">0055_frete.sql</span>. Aplique no Supabase e recarregue a página.
      </Card>
    );
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(
        salvarFrete({ token: token.trim() || undefined, ambiente, cep_origem: cep, servicos, acrescimo: acrescimo ?? 0, frete_gratis_acima: gratis, na_vitrine: naVitrine }),
        { erro: "Erro ao salvar o frete" },
      );
      if (r.ok) {
        setToken("");
        toast.success(r.dado.saldo != null ? `Melhor Envio conectado. Saldo: ${formatBRL(r.dado.saldo)}.` : "Frete salvo.");
      }
    });
  }

  function testar() {
    startTransition(async () => {
      const r = await executarComToast(testarFrete(cepTeste), { erro: "Erro ao cotar" });
      if (r.ok) {
        setCotacoes(r.dado.todas);
        if (!r.dado.todas.length) toast.error("Nenhuma transportadora atende este trecho.");
      }
    });
  }

  async function desconectar() {
    const ok = await confirm({ title: "Desconectar o Melhor Envio?", message: "O token é apagado. A vitrine para de cotar frete até você conectar de novo.", confirmLabel: "Desconectar" });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(desconectarFrete(), { sucesso: "Melhor Envio desconectado", erro: "Erro ao desconectar" });
    });
  }

  const alternar = (id: number) => setServicos((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <Truck size={20} className="text-accent mt-0.5" />
            <div>
              <CardTitle>Melhor Envio</CardTitle>
              <p className="text-sm text-text-secondary">Correios, Jadlog, Loggi, J&amp;T e outras, com cotação e etiqueta pelo saldo da sua conta.</p>
            </div>
          </div>
          <StatusChip tone={frete.conectado ? "positive" : "neutral"} label={frete.conectado ? "Conectado" : "Não conectado"} />
        </div>

        {!cofreOk && <p className="text-sm text-negative mb-3">O cofre de chaves não está configurado neste servidor (IA_CHAVE_COFRE). Sem ele não dá para guardar o token.</p>}

        <FormField label={frete.conectado ? "Trocar token (deixe vazio para manter)" : "Token do Melhor Envio"}>
          <input className={inputClass} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole aqui o token gerado no Melhor Envio" />
        </FormField>
        <p className="text-xs text-text-tertiary -mt-2 mb-4">
          No Melhor Envio: Configurações → Permissões de acesso → Gerar novo token, com cotação, carrinho, compra, geração e impressão de etiquetas. Cole só aqui, nunca em
          conversas.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Ambiente">
            <select className={inputClass} value={ambiente} onChange={(e) => setAmbiente(e.target.value as FreteConfig["ambiente"])}>
              <option value="producao">Produção</option>
              <option value="sandbox">Sandbox (teste)</option>
            </select>
          </FormField>
          <FormField label="CEP de origem">
            <input className={inputClass} inputMode="numeric" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
          </FormField>
          <FormField label="Acréscimo por envio (R$)">
            <input className={inputClass} inputMode="decimal" value={acrescimo ?? ""} onChange={(e) => setAcrescimo(num(e.target.value))} placeholder="0,00" />
          </FormField>
          <FormField label="Frete grátis a partir de (R$)">
            <input className={inputClass} inputMode="decimal" value={gratis ?? ""} onChange={(e) => setGratis(num(e.target.value))} placeholder="Nunca" />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary mb-4">
          <input type="checkbox" checked={naVitrine} onChange={(e) => setNaVitrine(e.target.checked)} /> Cotar frete no checkout da vitrine (o cliente escolhe a entrega)
        </label>

        {frete.conectado && (
          <Button variant="destructive" size="sm" onClick={desconectar} disabled={pending}>
            Desconectar
          </Button>
        )}
      </Card>

      {frete.conectado && (
        <Card>
          <CardTitle className="mb-1">Testar cotação e escolher serviços</CardTitle>
          <p className="text-sm text-text-secondary mb-3">Cota uma caixinha padrão (300 g, 16×11×4 cm) até o CEP. Marque os serviços que você aceita; nenhum marcado = todos.</p>
          <div className="flex gap-2 mb-3">
            <input className={`${inputClass} max-w-[10rem]`} inputMode="numeric" value={cepTeste} onChange={(e) => setCepTeste(e.target.value)} placeholder="CEP de destino" aria-label="CEP de destino" />
            <Button variant="secondary" loading={pending} onClick={testar}>
              Cotar
            </Button>
          </div>
          {cotacoes && cotacoes.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {cotacoes.map((c) => (
                <li key={c.servicoId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={servicos.includes(c.servicoId)} onChange={() => alternar(c.servicoId)} />
                    <span className="text-text-primary">
                      {c.transportadora} {c.servico}
                    </span>
                  </label>
                  <span className="font-mono text-text-secondary">
                    {formatBRL(c.valor)} · {c.prazoDias ?? "?"} dia(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {/* Um "Salvar" só, embaixo dos dois cartões: os serviços marcados na cotação também são
          gravados por ele (antes o texto mandava "clicar em Salvar acima"). */}
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} onClick={salvar} disabled={!cofreOk && !!token}>
          Salvar frete
        </Button>
      </div>
      {ConfirmDialog}
    </div>
  );
}
