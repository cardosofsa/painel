import { describe, expect, it } from "vitest";
import { ajustarDuplicatas, interpretarNfeXml } from "./compras-nfe";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe29261012345678000199550010000012341000012345" versao="4.00">
<ide><cUF>29</cUF><nNF>1234</nNF><serie>1</serie><dhEmi>2026-10-01T09:30:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>ATACADO SOL &amp; MAR LTDA</xNome><xFant>Atacado Sol</xFant></emit>
<det nItem="1"><prod><cProd>CAN-01</cProd><cEAN>7891234567895</cEAN><xProd>Caneca térmica 500ml</xProd><NCM>96170010</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>20.0000000000</vUnCom><vProd>200.00</vProd></prod><imposto></imposto></det>
<det nItem="2"><prod><cProd>KIT-9</cProd><cEAN>SEM GTIN</cEAN><xProd>Kit café</xProd><NCM>09012100</NCM><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>50.00</vUnCom><vProd>100.00</vProd></prod></det>
<total><ICMSTot><vProd>300.00</vProd><vFrete>15.00</vFrete><vIPI>30.00</vIPI><vST>0.00</vST><vOutro>0.00</vOutro><vDesc>0.00</vDesc><vNF>345.00</vNF></ICMSTot></total>
<cobr><fat><nFat>1234</nFat></fat><dup><nDup>001</nDup><dVenc>2026-10-31</dVenc><vDup>172.50</vDup></dup><dup><nDup>002</nDup><dVenc>2026-11-30</dVenc><vDup>172.50</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

describe("XML da NF-e de compra", () => {
  it("lê cabeçalho, emitente, itens, frete, total e duplicatas", () => {
    const n = interpretarNfeXml(XML);
    expect(n.chave).toBe("29261012345678000199550010000012341000012345");
    expect(n.numero).toBe("1234");
    expect(n.emissao).toBe("2026-10-01");
    expect(n.emitente).toEqual({ cnpj: "12345678000199", nome: "Atacado Sol" });
    expect(n.itens.map((i) => [i.codigo, i.ean, i.quantidade])).toEqual([
      ["CAN-01", "7891234567895", 10],
      ["KIT-9", null, 2],
    ]);
    expect(n.frete).toBe(15);
    expect(n.total).toBe(345);
    expect(n.duplicatas).toEqual([
      { numero: "001", vencimento: "2026-10-31", valor: 172.5 },
      { numero: "002", vencimento: "2026-11-30", valor: 172.5 },
    ]);
  });

  it("rateia o IPI no custo de cada item (o pedido fecha com o total da nota)", () => {
    const n = interpretarNfeXml(XML);
    // IPI 30 sobre 300 de produtos = 10%: caneca 20 → 22, kit 50 → 55.
    expect(n.itens.map((i) => i.custoUnitario)).toEqual([22, 55]);
    const pedido = n.itens.reduce((s, i) => s + i.custoUnitario * i.quantidade, 0) + n.frete;
    expect(pedido).toBe(n.total);
  });

  it("duplicatas absorvem centavos de arredondamento, mas não diferença grande", () => {
    expect(ajustarDuplicatas([{ numero: "1", vencimento: "2026-10-31", valor: 50 }, { numero: "2", vencimento: "2026-11-30", valor: 50 }], 100.02)).toEqual([
      { vencimento: "2026-10-31", valor: 50 },
      { vencimento: "2026-11-30", valor: 50.02 },
    ]);
    expect(ajustarDuplicatas([{ numero: "1", vencimento: "2026-10-31", valor: 50 }], 80)).toBeNull();
  });

  it("recusa arquivo que não é NF-e", () => {
    expect(() => interpretarNfeXml("<html></html>")).toThrow("não parece");
  });
});
