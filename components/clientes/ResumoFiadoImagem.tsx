"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { formatBRL, formatarDataIso } from "@/lib/format";
import type { DadosResumoFiado } from "@/lib/comprovante";

const ROTULO_STATUS_PARCELA: Record<string, { label: string; cor: string }> = {
  paga: { label: "Paga", cor: "#16a34a" },
  atrasada: { label: "Atrasada", cor: "#dc2626" },
  pendente: { label: "Pendente", cor: "#6b7280" },
};

/**
 * Card oculto capturado como PNG — "Enviar resumo" do box Fiado (2.5c). Mesmo padrão de
 * captura de `resultado-compartilhado.tsx` (`html-to-image`, sem dependência nova). O
 * cabeçalho "profissional" completo (logo definitivo, CNPJ, endereço) fica pra Fase 3 —
 * aqui só o nome do negócio, porque `perfil_negocio` ainda não tem coluna de logo.
 */
export function useResumoFiadoImagem(nomeNegocio: string | null, logoUrl: string | null = null) {
  const [pendente, setPendente] = useState<{ dados: DadosResumoFiado; acao: "copiar" | "baixar" } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendente || !ref.current) return;
    const node = ref.current;
    const { dados, acao } = pendente;
    (async () => {
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2 });
        const nomeArquivo = `fiado-venda-${dados.numero}.png`;
        if (acao === "copiar") {
          try {
            const blob = await (await fetch(dataUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            toast.success("Imagem copiada — cole na conversa do WhatsApp");
          } catch {
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = nomeArquivo;
            a.click();
            toast.error("Não foi possível copiar — baixando a imagem em vez disso");
          }
        } else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = nomeArquivo;
          a.click();
          toast.success("Imagem baixada");
        }
      } catch {
        toast.error("Erro ao gerar imagem do resumo");
      } finally {
        setPendente(null);
      }
    })();
  }, [pendente]);

  function abrirResumo(dados: DadosResumoFiado, acao: "copiar" | "baixar") {
    setPendente({ dados, acao });
  }

  const modais = (
    <div style={{ position: "fixed", left: -9999, top: 0, width: 380, pointerEvents: "none" }} aria-hidden>
      <div ref={ref}>
        {pendente && (
          <div style={{ background: "#ffffff", padding: 24, fontFamily: "system-ui, sans-serif", color: "#111827", border: "1px solid #e5e7eb" }}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- captura por html-to-image; precisa ser <img> puro
              <img
                src={logoUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ display: "block", margin: "0 auto 8px", maxHeight: 56, maxWidth: 160, objectFit: "contain" }}
              />
            )}
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2, textAlign: logoUrl ? "center" : "left" }}>
              {nomeNegocio ?? "Resumo de Fiado"}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>
              Venda {pendente.dados.numero} · {formatarDataIso(pendente.dados.data.slice(0, 10))}
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>Cliente: {pendente.dados.clienteNome}</div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, color: "#374151" }}>
              <span>Valor total</span>
              <span>{formatBRL(pendente.dados.valorTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, color: "#374151" }}>
              <span>Já pago</span>
              <span>{formatBRL(pendente.dados.valorPago)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 14,
                borderTop: "1px solid #e5e7eb",
                paddingTop: 8,
                marginTop: 4,
                marginBottom: 14,
                color: "#dc2626",
              }}
            >
              <span>Falta pagar</span>
              <span>{formatBRL(pendente.dados.valorRestante)}</span>
            </div>

            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Parcelas
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb" }}>
              {pendente.dados.parcelas.map((p) => {
                const rotulo = ROTULO_STATUS_PARCELA[p.status];
                return (
                  <div
                    key={p.numero}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      padding: "6px 0",
                      borderBottom: "1px solid #f3f4f6",
                      color: "#374151",
                    }}
                  >
                    <span>
                      {p.numero}/{p.totalParcelas} — vence {formatarDataIso(p.dataVencimento.slice(0, 10))}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{formatBRL(p.valor)}</span>
                      <span style={{ color: rotulo.cor, fontWeight: 600 }}>{rotulo.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return { abrirResumo, modais };
}
