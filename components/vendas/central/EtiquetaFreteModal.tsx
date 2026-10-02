"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import type { Cotacao } from "@/lib/frete/tipos";
import { comprarEtiquetaVenda, cotarFreteVenda } from "@/app/(painel)/vendas/frete-actions";

type Dados = { opcoes: (Cotacao & { gratis: boolean })[]; sugerido: number | null; jaComprada: boolean; destino: string; semMedida: string[] };

/**
 * "Comprar etiqueta" de uma venda com entrega (Melhor Envio): cota com o endereço do cliente,
 * escolhe o serviço e compra — cobra do saldo da conta, por isso o botão diz o valor.
 */
export function EtiquetaFreteModal({ vendaId, numero, onClose }: { vendaId: string; numero: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    cotarFreteVenda(vendaId)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) return setErro(r.erro);
        setDados(r.dado);
        setEscolhido(r.dado.sugerido && r.dado.opcoes.some((o) => o.servicoId === r.dado.sugerido) ? r.dado.sugerido : (r.dado.opcoes[0]?.servicoId ?? null));
      })
      .catch(() => vivo && setErro("Não foi possível cotar agora."));
    return () => {
      vivo = false;
    };
  }, [vendaId]);

  const opcao = dados?.opcoes.find((o) => o.servicoId === escolhido) ?? null;

  function comprar() {
    if (!opcao) return;
    startTransition(async () => {
      const r = await executarComToast(comprarEtiquetaVenda(vendaId, opcao.servicoId), { erro: "Erro ao comprar a etiqueta" });
      if (!r.ok) return;
      toast.success(`Etiqueta comprada (${formatBRL(r.dado.valor)})${r.dado.rastreio ? ` · rastreio ${r.dado.rastreio}` : ""}.`);
      if (r.dado.url) window.open(r.dado.url, "_blank", "noopener");
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title={`Etiqueta de envio · ${numero}`} width="max-w-md">
      {erro && <p className="text-sm text-negative mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-text-secondary mb-4">Cotando no Melhor Envio…</p>}
      {dados && (
        <>
          <p className="text-xs text-text-tertiary mb-3">Para: {dados.destino}</p>
          {dados.semMedida.length > 0 && (
            <p className="text-xs text-negative mb-3">Sem peso/medidas (usei uma caixinha padrão): {dados.semMedida.join(", ")}. Cadastre em Produtos para cotar certo.</p>
          )}
          {dados.jaComprada && <p className="text-sm text-text-secondary mb-3">Esta venda já tem etiqueta comprada.</p>}
          {dados.opcoes.length === 0 ? (
            <p className="text-sm text-text-secondary mb-4">Nenhum serviço atende este trecho.</p>
          ) : (
            <div className="space-y-1.5 mb-4" role="radiogroup" aria-label="Serviço de envio">
              {dados.opcoes.map((o) => (
                <button
                  key={o.servicoId}
                  type="button"
                  role="radio"
                  aria-checked={escolhido === o.servicoId}
                  onClick={() => setEscolhido(o.servicoId)}
                  className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${escolhido === o.servicoId ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                >
                  <span className="text-text-primary">
                    {o.transportadora} {o.servico}
                    {o.prazoDias ? <span className="text-text-tertiary"> · {o.prazoDias} dia(s)</span> : null}
                  </span>
                  <span className="font-mono">{formatBRL(o.valor)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        {opcao && !dados?.jaComprada && (
          <Button variant="primary" loading={pending} onClick={comprar}>
            Comprar por {formatBRL(opcao.valor)}
          </Button>
        )}
      </div>
    </Modal>
  );
}
