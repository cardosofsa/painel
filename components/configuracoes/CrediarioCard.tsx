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
import { cidadePix, detectarTipoChave, mascararChave, TIPOS_CHAVE_PIX, validarChavePix, type TipoChavePix } from "@/lib/pix-chave";
import { salvarCrediario, type CrediarioConfig } from "@/app/(painel)/configuracoes/actions";

/**
 * Pix e encargos do crediário (0065). A chave Pix vai no carnê (QR + copia-e-cola) e na
 * cobrança por WhatsApp; multa e juros entram no valor sugerido ao receber parcela atrasada.
 */
export function CrediarioCard({ inicial, nomePadrao, cidadePadrao }: { inicial: CrediarioConfig | null; nomePadrao: string; cidadePadrao: string }) {
  const [pending, startTransition] = useTransition();
  const chaveSalva = inicial?.pix_chave ?? "";
  const [tipo, setTipo] = useState<TipoChavePix>(chaveSalva ? detectarTipoChave(chaveSalva) : "cnpj");
  const [chave, setChave] = useState(chaveSalva ? mascararChave(detectarTipoChave(chaveSalva), chaveSalva) : "");
  const [nome, setNome] = useState(inicial?.pix_nome ?? nomePadrao.slice(0, 25));
  // O Pix guarda a cidade encurtada (15 letras); se ela é a da loja, mostra o nome inteiro.
  const salva = inicial?.pix_cidade ?? "";
  // (O corte antigo, "Feira de Santan", também é reconhecido pelo começo do nome.)
  const ehDaLoja = !!cidadePadrao && (cidadePix(cidadePadrao) === salva || cidadePadrao.toLowerCase().startsWith(salva.toLowerCase()));
  const [cidade, setCidade] = useState(!salva || ehDaLoja ? cidadePadrao || salva : salva);
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
  const validacao = chave.trim() ? validarChavePix(tipo, chave) : null;
  let pixOk = false;
  try {
    pixOk = !!validacao?.ok && !!gerarPixCopiaECola({ chave: validacao.chave, nome, cidade, valor: 1 });
  } catch {
    pixOk = false;
  }
  const cidadeNoPix = cidadePix(cidade);
  const exemploTipo = TIPOS_CHAVE_PIX.find((t) => t.id === tipo)?.exemplo ?? "";

  function salvar() {
    startTransition(async () => {
      await executarComToast(
        salvarCrediario({
          pix_chave: validacao?.ok ? validacao.chave : null,
          pix_nome: nome.trim() || null,
          pix_cidade: cidade.trim() || null,
          multa_atraso_pct: multaN,
          juros_mes_pct: jurosN,
        }),
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
      <div className="mb-1.5 text-xs font-medium text-text-secondary">Tipo da chave Pix</div>
      <div role="radiogroup" aria-label="Tipo da chave Pix" className="mb-3 flex flex-wrap gap-1.5">
        {TIPOS_CHAVE_PIX.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tipo === t.id}
            onClick={() => {
              setTipo(t.id);
              setChave((c) => mascararChave(t.id, c));
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${tipo === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:bg-surface-2"}`}
          >
            {t.rotulo}
          </button>
        ))}
      </div>
      <FormField label="Chave Pix" dica={validacao && !validacao.ok ? undefined : `Ex.: ${exemploTipo}`}>
        <input
          className={inputClass}
          value={chave}
          inputMode={tipo === "email" || tipo === "aleatoria" ? (tipo === "email" ? "email" : "text") : "numeric"}
          onChange={(e) => setChave(mascararChave(tipo, e.target.value))}
          placeholder={exemploTipo}
          aria-invalid={validacao ? !validacao.ok : undefined}
        />
        {validacao && !validacao.ok && <p className="mt-1 text-xs text-negative">{validacao.erro}</p>}
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Nome do recebedor" dica="Como aparece no banco (até 25 letras).">
          <input className={inputClass} value={nome} maxLength={25} onChange={(e) => setNome(e.target.value)} />
        </FormField>
        <FormField label="Cidade" dica={cidadeNoPix && cidadeNoPix !== cidade.trim() ? `No Pix vai como "${cidadeNoPix.toUpperCase()}" (o banco aceita até 15 letras).` : "Como no cadastro do banco."}>
          <input className={inputClass} value={cidade} maxLength={60} onChange={(e) => setCidade(e.target.value)} />
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
        {validacao?.ok && !pixOk && <span className="block text-negative mt-1">Preencha o nome do recebedor: sem ele o Pix não pode ser montado.</span>}
      </p>
      <div className="mt-auto">
        <Button variant="primary" onClick={salvar} loading={pending} disabled={multaN > 2 || multaN < 0 || jurosN < 0 || jurosN > 10 || (!!validacao && !validacao.ok)}>
          Salvar Pix e crediário
        </Button>
      </div>
    </Card>
  );
}
