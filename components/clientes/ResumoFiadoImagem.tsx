"use client";

import { formatBRL, formatarDataIso } from "@/lib/format";
import type { DadosResumoFiado } from "@/lib/comprovante";
import { useCapturaImagem } from "@/components/ui/PreviaImagem";

const STATUS_PARCELA: Record<string, { label: string; cor: string; fundo: string }> = {
  paga: { label: "Paga", cor: "#15803d", fundo: "#dcfce7" },
  atrasada: { label: "Atrasada", cor: "#b91c1c", fundo: "#fee2e2" },
  pendente: { label: "Pendente", cor: "#92400e", fundo: "#fef3c7" },
};

const COR = { texto: "#111827", suave: "#6b7280", linha: "#e5e7eb", fundoSuave: "#f9fafb" };

/**
 * Cartão do resumo de fiado, capturado como PNG. Estilos inline de propósito: a captura
 * (`html-to-image`) copia o CSS computado, e cor fixa aqui garante o mesmo resultado no
 * tema claro e no escuro do painel. Sem logo, o cabeçalho fica só com o nome, sem buraco.
 */
function CartaoResumoFiado({ dados, nomeNegocio, logoUrl, contato }: { dados: DadosResumoFiado; nomeNegocio: string | null; logoUrl: string | null; contato: string | null }) {
  const pago = dados.valorTotal > 0 ? Math.min(1, Math.max(0, dados.valorPago / dados.valorTotal)) : 0;
  return (
    <div style={{ background: "#ffffff", width: 420, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: COR.texto, borderRadius: 16, overflow: "hidden", border: `1px solid ${COR.linha}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: `1px solid ${COR.linha}` }}>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- captura por html-to-image; precisa ser <img> puro
          <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>{nomeNegocio ?? "Resumo de fiado"}</div>
          {contato && <div style={{ fontSize: 11, color: COR.suave, marginTop: 2 }}>{contato}</div>}
        </div>
      </div>

      <div style={{ padding: "18px 22px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COR.suave }}>Resumo de fiado</span>
          <span style={{ fontSize: 12, color: COR.suave }}>
            Venda {dados.numero} · {formatarDataIso(dados.data.slice(0, 10))}
          </span>
        </div>
        <div style={{ fontSize: 14, marginBottom: 14 }}>
          Cliente: <strong>{dados.clienteNome}</strong>
        </div>

        <div style={{ background: dados.valorRestante > 0 ? "#fef2f2" : "#f0fdf4", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: dados.valorRestante > 0 ? "#b91c1c" : "#15803d", fontWeight: 600 }}>{dados.valorRestante > 0 ? "Falta pagar" : "Quitado"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: dados.valorRestante > 0 ? "#b91c1c" : "#15803d", lineHeight: 1.15, marginTop: 2 }}>{formatBRL(dados.valorRestante)}</div>
          <div style={{ height: 6, background: "#ffffff", borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(pago * 100)}%`, height: "100%", background: "#16a34a", borderRadius: 99 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COR.suave, marginTop: 6 }}>
            <span>Pago {formatBRL(dados.valorPago)}</span>
            <span>Total {formatBRL(dados.valorTotal)}</span>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COR.suave, marginBottom: 6 }}>Parcelas</div>
        <div style={{ border: `1px solid ${COR.linha}`, borderRadius: 10, overflow: "hidden" }}>
          {dados.parcelas.map((p, i) => {
            const s = STATUS_PARCELA[p.status];
            return (
              <div
                key={p.numero}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", fontSize: 13, background: i % 2 ? COR.fundoSuave : "#ffffff", borderTop: i ? `1px solid ${COR.linha}` : "none" }}
              >
                <span>
                  <strong>
                    {p.numero}/{p.totalParcelas}
                  </strong>
                  <span style={{ color: COR.suave }}> · vence {formatarDataIso(p.dataVencimento.slice(0, 10))}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{formatBRL(p.valor)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.cor, background: s.fundo, borderRadius: 99, padding: "2px 8px" }}>{s.label}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 14 }}>Emitido em {new Date().toLocaleDateString("pt-BR")}</div>
      </div>
    </div>
  );
}

/** "Enviar resumo" do box Fiado: gera o cartão e abre a prévia (copiar, baixar, enviar). */
export function useResumoFiadoImagem(nomeNegocio: string | null, logoUrl: string | null = null, contato: string | null = null) {
  const { capturar, elementos } = useCapturaImagem();

  function abrirResumo(dados: DadosResumoFiado) {
    capturar(<CartaoResumoFiado dados={dados} nomeNegocio={nomeNegocio} logoUrl={logoUrl} contato={contato} />, {
      nome: `fiado-venda-${dados.numero}.png`,
      titulo: `Resumo do fiado · ${dados.numero}`,
      texto: `Resumo do fiado da venda ${dados.numero}: falta pagar ${formatBRL(dados.valorRestante)}.`,
      largura: 420,
    });
  }

  return { abrirResumo, modais: elementos };
}
