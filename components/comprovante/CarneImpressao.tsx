"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBRL, formatarDataIso } from "@/lib/format";
import type { DadosComprovante } from "@/lib/comprovante";
import { gerarPixCopiaECola } from "@/lib/pix";

/**
 * Carnê do crediário: uma lâmina por parcela, com canhoto (fica com a loja) e via do
 * cliente, separados por picote. Estilo INLINE e cores fixas, como o comprovante: é papel,
 * tem que sair igual no tema claro e no escuro do painel.
 */
const COR = { texto: "#111827", suave: "#6b7280", linha: "#d1d5db", pago: "#16a34a" };

const rotulo: CSSProperties = { fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: COR.suave };
const valor: CSSProperties = { fontSize: 13, fontWeight: 600 };

function Campo({ titulo, children, grande = false }: { titulo: string; children: React.ReactNode; grande?: boolean }) {
  return (
    <div>
      <div style={rotulo}>{titulo}</div>
      <div style={{ ...valor, fontSize: grande ? 16 : 13 }}>{children}</div>
    </div>
  );
}

/** Pix copia-e-cola de cada parcela em aberto (null = sem chave Pix ou parcela paga). */
function pixDasParcelas(dados: DadosComprovante, pix: { chave: string; nome: string; cidade: string } | null): (string | null)[] {
  return (dados.parcelas ?? []).map((p) => {
    if (!pix || p.status === "paga") return null;
    try {
      return gerarPixCopiaECola({ ...pix, valor: p.valor, txid: `${dados.numero}P${p.numero}` });
    } catch {
      return null;
    }
  });
}

export function CarneImpressao({ dados, pix = null }: { dados: DadosComprovante; pix?: { chave: string; nome: string; cidade: string } | null }) {
  const parcelas = dados.parcelas ?? [];
  const loja = dados.empresa?.nome ?? "Loja";
  const cliente = dados.cliente?.nome ?? dados.clienteNome ?? "Cliente";
  const codigos = useMemo(() => pixDasParcelas(dados, pix), [dados, pix]);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  // QR gerado no navegador (a lib só carrega aqui). data: URL — a CSP já libera imagem data:.
  useEffect(() => {
    const unicos = [...new Set(codigos.filter((c): c is string => !!c))];
    if (unicos.length === 0) return;
    let ativo = true;
    import("qrcode")
      .then((m) => Promise.all(unicos.map(async (c) => [c, await m.toDataURL(c, { width: 220, margin: 1, errorCorrectionLevel: "M" })] as const)))
      .then((pares) => {
        if (ativo) setQrs(Object.fromEntries(pares));
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [codigos]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5 print:hidden">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={14} /> Clientes
        </Link>
        <Button variant="primary" onClick={() => window.print()} disabled={parcelas.length === 0}>
          <Printer size={14} />
          Imprimir carnê
        </Button>
      </div>

      {parcelas.length === 0 ? (
        <p className="text-sm text-text-secondary">Esta venda não tem parcelas de crediário.</p>
      ) : (
        <div style={{ background: "#fff", color: COR.texto, maxWidth: 760, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
          {parcelas.map((p, i) => {
            const paga = p.status === "paga";
            return (
              <div
                key={p.numero}
                style={{ display: "grid", gridTemplateColumns: "1fr 2.2fr", border: `1px solid ${COR.linha}`, borderRadius: 6, marginBottom: 12, breakInside: "avoid" }}
              >
                {/* Canhoto: fica com a loja */}
                <div style={{ padding: 12, borderRight: `1px dashed ${COR.suave}`, display: "grid", gap: 6, alignContent: "start" }}>
                  <div style={{ ...rotulo, fontWeight: 700 }}>Canhoto · loja</div>
                  <Campo titulo="Venda">{dados.numero}</Campo>
                  <Campo titulo="Parcela">
                    {p.numero}/{p.totalParcelas}
                  </Campo>
                  <Campo titulo="Vencimento">{formatarDataIso(p.dataVencimento)}</Campo>
                  <Campo titulo="Valor">{formatBRL(p.valor)}</Campo>
                  <div style={{ ...rotulo, marginTop: 10, borderTop: `1px solid ${COR.linha}`, paddingTop: 4 }}>Recebido em ___/___/______</div>
                </div>

                {/* Via do cliente */}
                <div style={{ padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{loja}</div>
                    <div style={rotulo}>Carnê · via do cliente</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <Campo titulo="Cliente">{cliente}</Campo>
                    <Campo titulo="Venda">{dados.numero}</Campo>
                    <Campo titulo="Parcela">
                      {p.numero} de {p.totalParcelas}
                    </Campo>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, borderTop: `1px solid ${COR.linha}`, paddingTop: 8 }}>
                    <Campo titulo="Vencimento" grande>
                      {formatarDataIso(p.dataVencimento)}
                    </Campo>
                    <Campo titulo="Valor" grande>
                      {formatBRL(p.valor)}
                    </Campo>
                    <Campo titulo="Situação">
                      <span style={{ color: paga ? COR.pago : COR.texto }}>{paga ? "Paga" : "A pagar"}</span>
                    </Campo>
                  </div>
                  {codigos[i] && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", borderTop: `1px solid ${COR.linha}`, paddingTop: 8 }}>
                      {qrs[codigos[i] as string] && (
                        // eslint-disable-next-line @next/next/no-img-element -- QR em data: URL, gerado aqui; next/image não ajuda
                        <img src={qrs[codigos[i] as string]} alt={`QR Code Pix da parcela ${p.numero}`} width={84} height={84} style={{ flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={rotulo}>Pague com Pix · copia e cola</div>
                        <div style={{ fontSize: 8, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.3 }}>{codigos[i]}</div>
                      </div>
                    </div>
                  )}
                  {(dados.empresa?.telefone || dados.empresa?.enderecoLinha) && (
                    <div style={{ fontSize: 10, color: COR.suave }}>{[dados.empresa?.telefone, dados.empresa?.enderecoLinha].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
