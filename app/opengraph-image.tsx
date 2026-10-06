import { ImageResponse } from "next/og";

export const alt = "Sertão — gestão para quem vende online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Prévia do link (WhatsApp, redes). A imagem é gerada fora da página, sem acesso ao
 * `globals.css`: as cores são as dos tokens `--marca-*` do tema claro, escritas aqui.
 */
export default function ImagemCompartilhamento() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#2f3e18", color: "#f7f8f2", position: "relative" }}>
        <div style={{ position: "absolute", top: -160, right: -160, width: 520, height: 520, borderRadius: 9999, background: "#e9b949", opacity: 0.18 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 9999, background: "#e9b949" }} />
          Sertão
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, maxWidth: 950 }}>Saiba quanto cobrar, quanto tem e quanto lucra de verdade</div>
          <div style={{ fontSize: 30, color: "#d3dbc3" }}>Precificação com as taxas da Shopee e do Mercado Livre, estoque, vendas e financeiro.</div>
        </div>
      </div>
    ),
    size,
  );
}
