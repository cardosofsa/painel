import type { CSSProperties } from "react";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { garantiaTexto, itensComGarantia, type DadosComprovante } from "@/lib/comprovante";

/**
 * O comprovante de venda. Um layout só, para a imagem (PNG capturado por html-to-image) e
 * para a página de impressão/PDF.
 *
 * Estilo INLINE e cores fixas de propósito: a imagem tem que sair igual no tema claro e no
 * escuro do painel, então nada aqui lê variável CSS nem classe do Tailwind.
 */
const COR = {
  texto: "#111827",
  suave: "#6b7280",
  linha: "#e5e7eb",
  positivo: "#16a34a",
  negativo: "#dc2626",
  destaque: "#f9fafb",
};

const fusoBrasil = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const linhaFlex: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12 };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${COR.linha}`, paddingTop: 10, marginTop: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: COR.suave, marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );
}

export function ComprovanteVenda({ dados, largura = 380 }: { dados: DadosComprovante; largura?: number }) {
  const { empresa, cliente, pagamento, parcelas } = dados;
  const comGarantia = itensComGarantia(dados.itens);
  const nomeCliente = cliente?.nome ?? dados.clienteNome;
  const temEntrada = !!pagamento && pagamento.entradaValor > 0;
  const restante = dados.total - (temEntrada ? pagamento.entradaValor : 0);

  return (
    <div
      style={{
        width: largura,
        maxWidth: "100%",
        boxSizing: "border-box",
        background: "#ffffff",
        color: COR.texto,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: 13,
        padding: 24,
        border: `1px solid ${COR.linha}`,
        position: "relative",
      }}
    >
      {dados.status === "cancelada" && (
        <div style={{ textAlign: "center", color: COR.negativo, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
          VENDA CANCELADA
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 4 }}>
        {empresa?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- capturado por html-to-image; precisa ser <img> puro
          <img
            src={empresa.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ display: "block", margin: "0 auto 8px", maxHeight: 64, maxWidth: 180, objectFit: "contain" }}
          />
        )}
        <div style={{ fontWeight: 700, fontSize: 17 }}>{empresa?.nome || "Comprovante de venda"}</div>
        {empresa?.cnpj && <div style={{ fontSize: 11, color: COR.suave }}>CNPJ {empresa.cnpj}</div>}
        {empresa?.enderecoLinha && <div style={{ fontSize: 11, color: COR.suave, marginTop: 2 }}>{empresa.enderecoLinha}</div>}
        {(empresa?.telefone || empresa?.email || empresa?.instagram) && (
          <div style={{ fontSize: 11, color: COR.suave, marginTop: 2 }}>
            {[empresa.telefone, empresa.email, empresa.instagram].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ ...linhaFlex, marginTop: 14, fontSize: 12 }}>
        <span style={{ fontWeight: 600 }}>Venda {dados.numero}</span>
        <span style={{ color: COR.suave }}>{dados.data ? fusoBrasil.format(new Date(dados.data)) : ""}</span>
      </div>

      {(nomeCliente || cliente) && (
        <Secao titulo="Cliente">
          <div style={{ fontWeight: 600 }}>{nomeCliente}</div>
          {cliente?.whatsapp && <div style={{ color: COR.suave, fontSize: 12 }}>{cliente.whatsapp}</div>}
          {cliente?.email && <div style={{ color: COR.suave, fontSize: 12 }}>{cliente.email}</div>}
          {cliente?.enderecoLinha && <div style={{ color: COR.suave, fontSize: 12 }}>{cliente.enderecoLinha}</div>}
        </Secao>
      )}

      <Secao titulo="Produtos">
        {dados.itens.map((i, idx) => (
          <div key={idx} style={{ ...linhaFlex, marginBottom: 4 }}>
            <span>
              {i.quantidade}× {i.nome}
              {i.quantidade > 1 && <span style={{ color: COR.suave }}> ({formatBRL(i.preco_unitario)} un.)</span>}
            </span>
            <span style={{ whiteSpace: "nowrap" }}>{formatBRL(i.preco_unitario * i.quantidade)}</span>
          </div>
        ))}
      </Secao>

      <div style={{ borderTop: `1px solid ${COR.linha}`, marginTop: 10, paddingTop: 8 }}>
        <div style={{ ...linhaFlex, color: COR.suave }}>
          <span>Subtotal</span>
          <span>{formatBRL(dados.subtotal)}</span>
        </div>
        {dados.desconto > 0 && (
          <div style={{ ...linhaFlex, color: COR.suave }}>
            <span>Desconto</span>
            <span>-{formatBRL(dados.desconto)}</span>
          </div>
        )}
        {dados.valorEntrega > 0 && (
          <div style={{ ...linhaFlex, color: COR.suave }}>
            <span>Entrega</span>
            <span>{formatBRL(dados.valorEntrega)}</span>
          </div>
        )}
        <div style={{ ...linhaFlex, fontWeight: 700, fontSize: 16, marginTop: 6 }}>
          <span>Total</span>
          <span style={{ color: COR.positivo }}>{formatBRL(dados.total)}</span>
        </div>
      </div>

      {(dados.formaPagamento || temEntrada) && (
        <Secao titulo="Pagamento">
          {dados.formaPagamento && <div>{dados.formaPagamento}</div>}
          {temEntrada && (
            <div style={{ color: COR.suave, fontSize: 12, marginTop: 2 }}>
              Entrada{pagamento.entradaForma ? ` (${pagamento.entradaForma})` : ""}: {formatBRL(pagamento.entradaValor)} · Restante:{" "}
              {formatBRL(restante)}
            </div>
          )}
          {pagamento && pagamento.parcelasCartao && pagamento.parcelasCartao > 1 && (
            <div style={{ color: COR.suave, fontSize: 12 }}>Cartão em {pagamento.parcelasCartao}x</div>
          )}
          {pagamento && pagamento.taxaMaquinetaValor > 0 && (
            <div style={{ color: COR.suave, fontSize: 12 }}>
              Taxa de maquineta ({pagamento.taxaMaquinetaPct}%): {formatBRL(pagamento.taxaMaquinetaValor)}
            </div>
          )}
        </Secao>
      )}

      {parcelas && parcelas.length > 0 && (
        <Secao titulo="Parcelas">
          {parcelas.map((p) => {
            const cor = p.status === "paga" ? COR.positivo : p.status === "atrasada" ? COR.negativo : COR.suave;
            const rotulo = p.status === "paga" ? "Paga" : p.status === "atrasada" ? "Atrasada" : "Em aberto";
            return (
              <div key={p.numero} style={{ ...linhaFlex, marginBottom: 3, fontSize: 12 }}>
                <span>
                  {p.numero}/{p.totalParcelas} · vence {formatarDataIso(p.dataVencimento)}
                </span>
                <span style={{ whiteSpace: "nowrap" }}>
                  {formatBRL(p.valor)} <span style={{ color: cor, fontWeight: 600 }}>{rotulo}</span>
                </span>
              </div>
            );
          })}
        </Secao>
      )}

      {comGarantia.length > 0 && (
        <Secao titulo="Garantia">
          {comGarantia.map((i, idx) => (
            <div key={idx} style={{ ...linhaFlex, marginBottom: 3, fontSize: 12 }}>
              <span>{i.nome}</span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{garantiaTexto(i.garantia_dias)}</span>
            </div>
          ))}
        </Secao>
      )}

      <div style={{ textAlign: "center", color: COR.suave, fontSize: 11, marginTop: 16 }}>Obrigado pela preferência!</div>
    </div>
  );
}
