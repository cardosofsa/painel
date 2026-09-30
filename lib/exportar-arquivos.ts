"use client";

/**
 * Gera os arquivos de exportação no navegador. As bibliotecas (exceljs ~1 MB, jspdf) são
 * carregadas com `import()` só no clique: quem nunca exporta não paga o download.
 */

import { celulaPlanilha, matrizTexto, nomeArquivo, tabelaParaCsv, type TabelaExport } from "@/lib/exportar";

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FORMATO_EXCEL: Record<string, string> = {
  moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  percentual: "0.0%",
  numero: "#,##0.###",
  inteiro: "#,##0",
  data: "dd/mm/yyyy",
};

export async function gerarXlsx<L>(t: TabelaExport<L>): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "SERTÃO";
  const ws = wb.addWorksheet(t.titulo.slice(0, 31) || "Dados", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = t.colunas.map((c) => ({ header: c.rotulo, width: Math.max(10, c.largura ?? c.rotulo.length + 4), style: c.tipo && FORMATO_EXCEL[c.tipo] ? { numFmt: FORMATO_EXCEL[c.tipo] } : {} }));
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B4D1F" } };
  cab.alignment = { vertical: "middle" };
  for (const linha of t.linhas) ws.addRow(t.colunas.map((c) => celulaPlanilha(c.valor(linha), c.tipo)));
  if (t.total) {
    const r = ws.addRow(t.total.map((v) => (typeof v === "number" ? v : v == null ? null : celulaPlanilha(v, "texto"))));
    r.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.colunas.length } };
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function gerarPdf<L>(t: TabelaExport<L>, empresa?: { nome: string | null } | null): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const m = matrizTexto(t);
  const deitado = t.colunas.length > 6;
  const doc = new jsPDF({ orientation: deitado ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const margem = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t.titulo, margem, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  const linhaSub = [empresa?.nome, t.subtitulo, `Gerado em ${new Date().toLocaleString("pt-BR")}`].filter(Boolean).join(" · ");
  doc.text(linhaSub, margem, 58);
  autoTable(doc, {
    startY: 70,
    head: [m.cabecalho],
    body: m.linhas,
    foot: m.total ? [m.total] : undefined,
    margin: { left: margem, right: margem },
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [59, 77, 31], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: Object.fromEntries(
      t.colunas.map((c, i) => [i, { halign: c.tipo && c.tipo !== "texto" && c.tipo !== "data" ? "right" : "left" }]),
    ),
  });
  return doc.output("blob");
}

export function gerarCsv<L>(t: TabelaExport<L>): Blob {
  return new Blob([`﻿${tabelaParaCsv(t)}`], { type: "text/csv;charset=utf-8;" });
}

export async function exportarTabela<L>(t: TabelaExport<L>, formato: "xlsx" | "pdf" | "csv", empresa?: { nome: string | null } | null) {
  const blob = formato === "xlsx" ? await gerarXlsx(t) : formato === "pdf" ? await gerarPdf(t, empresa) : gerarCsv(t);
  baixarBlob(blob, nomeArquivo(t.titulo, formato));
}
