"use client";

import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { encargosAtraso } from "@/lib/crediario";
import { gerarPixCopiaECola } from "@/lib/pix";
import { salvarCrediario, type CrediarioConfig } from "@/app/(painel)/configuracoes/actions";

/**
 * Pix e encargos do crediário (0065). A chave Pix vai no carnê (QR + copia-e-cola) e na
 * cobrança por WhatsApp; multa e juros entram no valor sugerido ao receber parcela atrasada.
 */
export function CrediarioCard({ inicial, nomePadrao, cidadePadrao }: { inicial: CrediarioConfig | null; nomePadrao: string; cidadePadrao: string }) {
  const [pending, startTransition] = useTransition();
  const [chave, setChave] = useState(inicial?.pix_chave ?? "");
  const [nome, setNome] = useState(inicial?.pix_nome ?? nomePadrao.slice(0, 25));
  const [cidade, setCidade] = useState(inicial?.pix_cidade ?? cidadePadrao.slice(0, 15));
  const [multa, setMulta] = useState(String(inicial?.multa_atraso_pct ?? 0));
  const [juros, setJuros] = useState(String(inicial?.juros_mes_pct ?? 0));

  if (!inicial) {
    return (
      <Card className="text-sm text-text-secondary">
        <CardTitle className="mb-2">Pix e crediário</CardTitle>
        Chave Pix no carnê e multa/juros por atraso precisam da migração <span className="font-mono">0065_crediario_pix_encargos.sql</span>. Aplique no Supabase e recarregue.
      </Card>
    );
  }

  const multaN = numeroOuNulo(multa) ?? 0;
  const jurosN = numeroOuNulo(juros) ?? 0;
  const exemplo = encargosAtraso(100, "2026-01-01", "2026-01-11", { multaPct: multaN, jurosMesPct: jurosN });
  let pixOk = false;
  try {
    pixOk = !!chave.trim() && !!gerarPixCopiaECola({ chave, nome, cidade, valor: 1 });
  } catch {
    pixOk = false;
  }

  function salvar() {
    startTransition(async () => {
      await executarComToast(
        salvarCrediario({ pix_chave: chave.trim() || null, pix_nome: nome.trim() || null, pix_cidade: cidade.trim() || null, multa_atraso_pct: multaN, juros_mes_pct: jurosN }),
        { sucesso: "Pix e crediário salvos", erro: "Erro ao salvar" },
      );
    });
  }

  return (
    <Card className="flex flex-col">
      <CardTitle className="mb-1 flex items-center gap-2">
        <QrCode size={16} className="text-accent" /> Pix e crediário
      </CardTitle>
      <p className="text-xs text-text-tertiary mb-4">A chave sai no carnê (QR e copia-e-cola) e na cobrança pelo WhatsApp. O cliente paga direto no banco dele, sem taxa.</p>
      <FormField label="Chave Pix" dica="CPF/CNPJ, e-mail, celular ou chave aleatória.">
        <input className={inputClass} value={chave} onChange={(e) => setChave(e.target.value)} placeholder="ex.: loja@email.com" />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Nome do recebedor" dica="Como aparece no banco (até 25 letras).">
          <input className={inputClass} value={nome} maxLength={25} onChange={(e) => setNome(e.target.value)} />
        </FormField>
        <FormField label="Cidade" dica="Até 15 letras.">
          <input className={inputClass} value={cidade} maxLength={15} onChange={(e) => setCidade(e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Multa por atraso (%)" dica="Uma vez só. O máximo é 2% (Código de Defesa do Consumidor).">
          <input type="text" inputMode="decimal" className={inputClass} value={multa} onChange={(e) => setMulta(e.target.value)} />
        </FormField>
        <FormField label="Juros ao mês (%)" dica="Cobrados por dia de atraso (1% ao mês é o comum).">
          <input type="text" inputMode="decimal" className={inputClass} value={juros} onChange={(e) => setJuros(e.target.value)} />
        </FormField>
      </div>
      <p className="text-xs text-text-secondary mb-4">
        {multaN > 0 || jurosN > 0
          ? `Exemplo: parcela de ${formatBRL(100)} com 10 dias de atraso fica ${formatBRL(exemplo.total)} (multa ${formatBRL(exemplo.multa)} + juros ${formatBRL(exemplo.juros)}).`
          : "Sem multa e sem juros: a parcela atrasada continua com o mesmo valor."}
        {chave.trim() && !pixOk && <span className="block text-negative mt-1">Confira a chave e o nome do recebedor: o Pix não pode ser montado assim.</span>}
      </p>
      <div className="mt-auto">
        <Button variant="primary" onClick={salvar} loading={pending} disabled={multaN > 2 || multaN < 0 || jurosN < 0 || jurosN > 10}>
          Salvar Pix e crediário
        </Button>
      </div>
    </Card>
  );
}
