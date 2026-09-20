"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import { resultadoParaPreco, type ComponenteKit, type TaxasPlataforma } from "@/lib/pricing";

export interface ResumoExport {
  titulo: string;
  precoVenda: number;
  custoTotal: number;
  taxaVariavelValor: number;
  taxaVariavelPct: number;
  taxaFixa: number;
  taxaAdicionalValor: number;
  taxaAdicionalPct: number;
  impostoValor: number;
  impostoPct: number;
  taxaExtraCalculada: number;
  lucroLiquido: number;
  margemEfetivaPct: number;
  componentes: ComponenteKit[] | null;
}

export function precoPsicologico(preco: number): number {
  if (preco <= 0) return 0;
  const base = Math.floor(preco);
  const candidato = base + 0.9;
  return candidato >= preco ? candidato : base + 1 + 0.9;
}

export function montarTextoResumo(r: ResumoExport, formato: "simples" | "completo"): string {
  const linhas = [`*${r.titulo}*`];
  if (formato === "completo" && r.componentes && r.componentes.length > 0) {
    linhas.push("", "Custo:");
    for (const c of r.componentes) {
      linhas.push(`- ${c.nome}: ${formatBRL(c.quantidade * c.custoUnitario)}`);
    }
    linhas.push(`Total: ${formatBRL(r.custoTotal)}`);
  } else {
    linhas.push(`Custo: ${formatBRL(r.custoTotal)}`);
  }
  if (formato === "completo") {
    linhas.push("", "Taxas:");
    linhas.push(`- Taxa variável (${(r.taxaVariavelPct * 100).toFixed(1)}%): ${formatBRL(r.taxaVariavelValor)}`);
    if (r.taxaFixa > 0) linhas.push(`- Taxa fixa: ${formatBRL(r.taxaFixa)}`);
    if (r.taxaAdicionalPct > 0) linhas.push(`- Taxa adicional (${(r.taxaAdicionalPct * 100).toFixed(1)}%): ${formatBRL(r.taxaAdicionalValor)}`);
    if (r.taxaExtraCalculada > 0) linhas.push(`- Taxa extra: ${formatBRL(r.taxaExtraCalculada)}`);
    linhas.push(`- Imposto (${(r.impostoPct * 100).toFixed(1)}%): ${formatBRL(r.impostoValor)}`);
  }
  linhas.push("", `Preço de venda: ${formatBRL(r.precoVenda)}`);
  linhas.push(`Lucro líquido: ${formatBRL(r.lucroLiquido)} (${(r.margemEfetivaPct * 100).toFixed(1)}%)`);
  return linhas.join("\n");
}

export function FormatoExportModal({
  aberto,
  onClose,
  onEscolher,
}: {
  aberto: boolean;
  onClose: () => void;
  onEscolher: (formato: "simples" | "completo") => void;
}) {
  return (
    <Modal open={aberto} onClose={onClose} title="Formato do texto">
      <p className="text-sm text-text-secondary mb-4">Escolha como montar o texto.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => onEscolher("simples")}>
          Simplificada
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onEscolher("completo")}>
          Completa
        </Button>
      </div>
    </Modal>
  );
}

export function useExportarPrecificacao() {
  const [pendenteExport, setPendenteExport] = useState<{ acao: "copiar" | "whatsapp"; dados: ResumoExport } | null>(null);
  const [pendenteImagem, setPendenteImagem] = useState<ResumoExport | null>(null);
  const [imagemFormato, setImagemFormato] = useState<"simples" | "completo">("completo");
  const [imagemParaExportar, setImagemParaExportar] = useState<{
    dados: ResumoExport;
    acao: "copiar" | "baixar";
    formato: "simples" | "completo";
  } | null>(null);
  const imagemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imagemParaExportar || !imagemRef.current) return;
    const node = imagemRef.current;
    const { dados, acao } = imagemParaExportar;
    (async () => {
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2 });
        if (acao === "copiar") {
          try {
            const blob = await (await fetch(dataUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            toast.success("Imagem copiada — cole na conversa do WhatsApp");
          } catch {
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `precificacao-${dados.titulo.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.png`;
            a.click();
            toast.error("Não foi possível copiar — baixando a imagem em vez disso");
          }
        } else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `precificacao-${dados.titulo.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.png`;
          a.click();
          toast.success("Imagem baixada — anexe manualmente na conversa do WhatsApp");
        }
      } catch {
        toast.error("Erro ao gerar imagem");
      } finally {
        setImagemParaExportar(null);
      }
    })();
  }, [imagemParaExportar]);

  async function executarExport(formato: "simples" | "completo") {
    if (!pendenteExport) return;
    const texto = montarTextoResumo(pendenteExport.dados, formato);
    if (pendenteExport.acao === "copiar") {
      try {
        await navigator.clipboard.writeText(texto);
        toast.success("Precificação copiada");
      } catch {
        toast.error("Não foi possível copiar");
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    }
    setPendenteExport(null);
  }

  const modais = (
    <>
      <FormatoExportModal aberto={!!pendenteExport} onClose={() => setPendenteExport(null)} onEscolher={executarExport} />

      <Modal
        open={!!pendenteImagem}
        onClose={() => {
          setPendenteImagem(null);
          setImagemFormato("completo");
        }}
        title="Imagem"
      >
        <p className="text-sm text-text-secondary mb-4">Escolha o formato e depois copie ou baixe o PNG.</p>
        <div className="flex gap-2 mb-4">
          <Button
            variant={imagemFormato === "simples" ? "primary" : "secondary"}
            className="flex-1"
            onClick={() => setImagemFormato("simples")}
          >
            Simplificada
          </Button>
          <Button
            variant={imagemFormato === "completo" ? "primary" : "secondary"}
            className="flex-1"
            onClick={() => setImagemFormato("completo")}
          >
            Completa
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              if (pendenteImagem) setImagemParaExportar({ dados: pendenteImagem, acao: "copiar", formato: imagemFormato });
              setPendenteImagem(null);
            }}
          >
            Copiar Imagem
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              if (pendenteImagem) setImagemParaExportar({ dados: pendenteImagem, acao: "baixar", formato: imagemFormato });
              setPendenteImagem(null);
            }}
          >
            Baixar Imagem
          </Button>
        </div>
      </Modal>

      <div style={{ position: "fixed", left: -9999, top: 0, width: 360, pointerEvents: "none" }} aria-hidden>
        <div ref={imagemRef}>
          {imagemParaExportar && (
            <div style={{ background: "#ffffff", padding: 24, fontFamily: "system-ui, sans-serif", color: "#111827", border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{imagemParaExportar.dados.titulo}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>{new Date().toLocaleDateString("pt-BR")}</div>
              <div style={{ textAlign: "center", margin: "14px 0" }}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>Preço de Venda</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: "#4f46e5", fontFamily: "monospace" }}>
                  {formatBRL(imagemParaExportar.dados.precoVenda)}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, fontSize: 13 }}>
                {imagemParaExportar.formato === "completo" ? (
                  <>
                    {imagemParaExportar.dados.componentes && imagemParaExportar.dados.componentes.length > 0 ? (
                      <>
                        {imagemParaExportar.dados.componentes.map((c, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                            <span>{c.nome}</span>
                            <span>{formatBRL(c.quantidade * c.custoUnitario)}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                        <span>Custo</span>
                        <span>{formatBRL(imagemParaExportar.dados.custoTotal)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                      <span>Taxa variável ({(imagemParaExportar.dados.taxaVariavelPct * 100).toFixed(1)}%)</span>
                      <span>{formatBRL(imagemParaExportar.dados.taxaVariavelValor)}</span>
                    </div>
                    {imagemParaExportar.dados.taxaFixa > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                        <span>Taxa fixa</span>
                        <span>{formatBRL(imagemParaExportar.dados.taxaFixa)}</span>
                      </div>
                    )}
                    {imagemParaExportar.dados.taxaExtraCalculada > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                        <span>Taxa extra</span>
                        <span>{formatBRL(imagemParaExportar.dados.taxaExtraCalculada)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                      <span>Imposto ({(imagemParaExportar.dados.impostoPct * 100).toFixed(1)}%)</span>
                      <span>{formatBRL(imagemParaExportar.dados.impostoValor)}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Custo</span>
                    <span>{formatBRL(imagemParaExportar.dados.custoTotal)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    borderTop: "1px solid #e5e7eb",
                    paddingTop: 8,
                    marginTop: 8,
                    color: "#16a34a",
                  }}
                >
                  <span>Lucro líquido</span>
                  <span>
                    {formatBRL(imagemParaExportar.dados.lucroLiquido)} ({(imagemParaExportar.dados.margemEfetivaPct * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return { setPendenteExport, setPendenteImagem, modais };
}

export function DetalhamentoPrecificacao({
  aberto,
  onToggle,
  componentes,
  custoTotal,
  taxaVariavelValor,
  taxaVariavelPct,
  taxaFixa,
  taxaAdicionalValor,
  taxaAdicionalPct,
  taxaExtraCalculada,
  impostoValor,
  impostoPct,
}: {
  aberto: boolean;
  onToggle: () => void;
  componentes: ComponenteKit[] | null;
  custoTotal: number;
  taxaVariavelValor: number;
  taxaVariavelPct: number;
  taxaFixa: number;
  taxaAdicionalValor: number;
  taxaAdicionalPct: number;
  taxaExtraCalculada: number;
  impostoValor: number;
  impostoPct: number;
}) {
  return (
    <>
      <button onClick={onToggle} className="text-xs text-accent hover:underline">
        {aberto ? "Ocultar detalhamento ▲" : "Ver detalhamento ▾"}
      </button>
      {aberto && (
        <>
          <div className="flex justify-between text-text-secondary">
            <span>Custo</span>
            <span className="font-mono text-text-primary">{formatBRL(custoTotal)}</span>
          </div>
          {componentes && componentes.length > 0 && (
            <div className="pl-3 space-y-0.5">
              {componentes.map((c, i) => (
                <div key={i} className="flex justify-between text-[11px] text-text-tertiary">
                  <span>
                    {c.nome}
                    {c.quantidade > 1 ? ` × ${c.quantidade}` : ""}
                  </span>
                  <span className="font-mono">{formatBRL(c.quantidade * c.custoUnitario)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-text-secondary">
            <span>
              Taxa variável
              <span className="text-[10px] text-text-tertiary ml-1">({(taxaVariavelPct * 100).toFixed(1)}%)</span>
            </span>
            <span className="font-mono text-text-primary">{formatBRL(taxaVariavelValor)}</span>
          </div>
          {taxaFixa > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Taxa fixa</span>
              <span className="font-mono text-text-primary">{formatBRL(taxaFixa)}</span>
            </div>
          )}
          {taxaAdicionalPct > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>
                Taxa adicional
                <span className="text-[10px] text-text-tertiary ml-1">({(taxaAdicionalPct * 100).toFixed(1)}%)</span>
              </span>
              <span className="font-mono text-text-primary">{formatBRL(taxaAdicionalValor)}</span>
            </div>
          )}
          {taxaExtraCalculada > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Taxa extra</span>
              <span className="font-mono text-text-primary">{formatBRL(taxaExtraCalculada)}</span>
            </div>
          )}
          <div className="flex justify-between text-text-secondary">
            <span>
              Imposto
              <span className="text-[10px] text-text-tertiary ml-1">({(impostoPct * 100).toFixed(1)}%)</span>
            </span>
            <span className="font-mono text-text-primary">{formatBRL(impostoValor)}</span>
          </div>
        </>
      )}
    </>
  );
}

export function SimuladorPreco({ custoTotal, taxas }: { custoTotal: number; taxas: TaxasPlataforma }) {
  const [ativo, setAtivo] = useState(false);
  const [precoSimulado, setPrecoSimulado] = useState<number | "">("");

  if (!ativo) {
    return (
      <button onClick={() => setAtivo(true)} className="text-xs text-accent hover:underline">
        Simular preço diferente
      </button>
    );
  }

  const resultado = precoSimulado === "" || custoTotal <= 0 ? null : resultadoParaPreco(Number(precoSimulado), custoTotal, taxas);

  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Simular preço diferente</span>
        <button
          onClick={() => {
            setAtivo(false);
            setPrecoSimulado("");
          }}
          className="text-xs text-text-tertiary hover:text-negative"
        >
          Fechar
        </button>
      </div>
      <input
        type="number"
        step="0.01"
        placeholder="Preço hipotético (R$)"
        value={precoSimulado}
        onChange={(e) => setPrecoSimulado(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent text-sm"
      />
      {resultado && (
        <div className="text-sm space-y-1 pt-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Lucro líquido simulado</span>
            <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
              {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between text-text-tertiary text-xs">
            <span>Margem sobre custo simulada</span>
            <span className="font-mono">{(resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
