import type { CSSProperties, ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import type { ResumoExport } from "@/components/precificacao/resultado-compartilhado";

const COR = { texto: "#111827", suave: "#6b7280", linha: "#e5e7eb", fundo: "#f9fafb", positivo: "#15803d", negativo: "#b91c1c", destaque: "#4f46e5" };
const linha: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 13, color: "#374151" };
const pct = (f: number) => `${(f * 100).toFixed(1).replace(".", ",")}%`;

function Linha({ rotulo, valor, forte, cor }: { rotulo: ReactNode; valor: string; forte?: boolean; cor?: string }) {
  return (
    <div style={{ ...linha, fontWeight: forte ? 700 : 400, color: cor ?? linha.color }}>
      <span>{rotulo}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{valor}</span>
    </div>
  );
}

export interface EmpresaCartao {
  nome: string | null;
  logoUrl: string | null;
}

/**
 * Cartão da precificação para imagem (PNG). Estilo inline e cores fixas: sai igual no tema
 * claro e no escuro. Sem logo ou sem foto, o layout fecha o espaço em vez de deixar buraco.
 */
export function CartaoPrecificacao({ dados, formato, empresa }: { dados: ResumoExport; formato: "simples" | "completo"; empresa?: EmpresaCartao | null }) {
  const completo = formato === "completo";
  const lucroPositivo = dados.lucroLiquido >= 0;
  return (
    <div style={{ background: "#ffffff", width: 380, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: COR.texto, borderRadius: 16, overflow: "hidden", border: `1px solid ${COR.linha}` }}>
      {(empresa?.logoUrl || empresa?.nome) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${COR.linha}` }}>
          {empresa.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- captura por html-to-image; precisa ser <img> puro
            <img src={empresa.logoUrl} alt="" crossOrigin="anonymous" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }} />
          )}
          {empresa.nome && <span style={{ fontSize: 13, fontWeight: 600 }}>{empresa.nome}</span>}
        </div>
      )}

      <div style={{ padding: "18px 20px 20px" }}>
        <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.25, textAlign: "center" }}>{dados.titulo}</div>
        <div style={{ fontSize: 11, color: COR.suave, textAlign: "center", marginTop: 2 }}>{new Date().toLocaleDateString("pt-BR")}</div>

        {dados.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- captura por html-to-image; precisa ser <img> puro
          <img
            src={dados.imagemUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ display: "block", width: 160, height: 160, objectFit: "cover", borderRadius: 12, margin: "14px auto 0", border: `1px solid ${COR.linha}` }}
          />
        )}

        <div style={{ textAlign: "center", background: COR.fundo, borderRadius: 12, padding: "12px 0", margin: "14px 0" }}>
          <div style={{ fontSize: 11, color: COR.suave, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Preço de venda</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: COR.destaque, lineHeight: 1.15 }}>{formatBRL(dados.precoVenda)}</div>
        </div>

        {completo ? (
          <>
            {dados.componentes?.length ? (
              dados.componentes.map((c, i) => <Linha key={i} rotulo={c.nome} valor={formatBRL(c.quantidade * c.custoUnitario)} />)
            ) : (
              <Linha rotulo="Custo" valor={formatBRL(dados.custoTotal)} />
            )}
            <div style={{ borderTop: `1px dashed ${COR.linha}`, margin: "6px 0" }} />
            <Linha rotulo={`Comissão (${pct(dados.taxaVariavelPct)})`} valor={formatBRL(dados.taxaVariavelValor)} />
            {dados.taxaFixa > 0 && <Linha rotulo="Taxa fixa" valor={formatBRL(dados.taxaFixa)} />}
            {dados.taxaAdicionalPct > 0 && <Linha rotulo={`Taxa adicional (${pct(dados.taxaAdicionalPct)})`} valor={formatBRL(dados.taxaAdicionalValor)} />}
            {dados.taxaExtraCalculada > 0 && <Linha rotulo="Taxa extra" valor={formatBRL(dados.taxaExtraCalculada)} />}
            <Linha rotulo={`Imposto (${pct(dados.impostoPct)})`} valor={formatBRL(dados.impostoValor)} />
          </>
        ) : (
          <Linha rotulo="Custo" valor={formatBRL(dados.custoTotal)} />
        )}

        <div style={{ marginTop: 10, borderRadius: 10, padding: "10px 12px", background: lucroPositivo ? "#f0fdf4" : "#fef2f2" }}>
          <Linha rotulo="Lucro líquido" valor={`${formatBRL(dados.lucroLiquido)} (${pct(dados.margemEfetivaPct)})`} forte cor={lucroPositivo ? COR.positivo : COR.negativo} />
        </div>

        {completo && dados.faixaVenda && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: COR.suave, marginBottom: 2 }}>
              Faixa de venda: {formatBRL(dados.faixaVenda.precoMinimo)} a {formatBRL(dados.faixaVenda.precoMaximo)}
            </div>
            <Linha rotulo="Lucro mínimo" valor={`${formatBRL(dados.faixaVenda.lucroMinimo)} (${pct(dados.faixaVenda.margemMinimaPct)})`} />
            <Linha rotulo="Lucro máximo" valor={`${formatBRL(dados.faixaVenda.lucroMaximo)} (${pct(dados.faixaVenda.margemMaximaPct)})`} />
          </div>
        )}
      </div>
    </div>
  );
}
