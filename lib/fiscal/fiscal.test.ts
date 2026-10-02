import { describe, expect, it } from "vitest";
import { montarNfe, pendenciasFiscais, statusDaFocus, type ConfigFiscal, type VendaFiscal } from "./focus-nfe";

const config: ConfigFiscal = { ambiente: "homologacao", serie: 1, inscricao_estadual: "123456", crt: 1, cfop_padrao: "5102", cfop_fora_estado: "6102", csosn_padrao: "102", pis_cofins_cst: "07", natureza: "Venda de mercadoria" };
const empresa = { cnpj: "12.345.678/0001-90", nome: "Loja", uf: "BA" };
const cliente = { nome: "Ana", documento: "123.456.789-01", cep: "01001-000", endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "SP" };
const venda: VendaFiscal = {
  numero: "V-0010",
  data: "2026-10-02T10:00:00-03:00",
  desconto: 10,
  frete: 15,
  presencial: false,
  itens: [
    { codigo: "CAN", descricao: "Caneca", quantidade: 2, valorUnitario: 30, ncm: "69120000", origem: 0, cfop: null },
    { codigo: "PIR", descricao: "Pires", quantidade: 1, valorUnitario: 40, ncm: "69120000", origem: 0, cfop: null },
  ],
};

describe("NF-e", () => {
  it("lista o que falta antes de emitir", () => {
    const p = pendenciasFiscais({ ...venda, itens: [{ ...venda.itens[0], ncm: null }] }, { cnpj: "", nome: null, uf: null }, { ...cliente, documento: "", cep: null });
    expect(p).toEqual([
      "CNPJ da empresa (Configurações → Conta).",
      "UF da empresa (Configurações → Conta).",
      'NCM do produto "Caneca" (Produtos → editar).',
      "CPF ou CNPJ do cliente (cadastro do cliente).",
      "Endereço completo do cliente (entrega).",
    ]);
    expect(pendenciasFiscais(venda, empresa, cliente)).toEqual([]);
  });

  it("monta a nota: CFOP de fora do estado, desconto e frete rateados sem sobrar centavo", () => {
    const n = montarNfe(venda, config, empresa, cliente);
    expect(n.cnpj_emitente).toBe("12345678000190");
    expect(n).toMatchObject({ cpf_destinatario: "12345678901", local_destino: 2, presenca_comprador: 2, modalidade_frete: 0 });
    expect(n.items.map((i) => i.cfop)).toEqual(["6102", "6102"]);
    expect(n.items.reduce((s, i) => s + (i.valor_desconto ?? 0), 0)).toBeCloseTo(10);
    expect(n.items.reduce((s, i) => s + (i.valor_frete ?? 0), 0)).toBeCloseTo(15);
    expect(n.items[0]).toMatchObject({ valor_bruto: 60, codigo_ncm: "69120000", icms_situacao_tributaria: "102", pis_situacao_tributaria: "07" });
    const dentro = montarNfe(venda, config, empresa, { ...cliente, uf: "BA" });
    expect(dentro.items[0].cfop).toBe("5102");
  });

  it("status da Focus", () => {
    expect(statusDaFocus({ status: "autorizado" }).status).toBe("autorizada");
    expect(statusDaFocus({ status: "processando_autorizacao" }).status).toBe("processando");
    expect(statusDaFocus({ status: "erro_autorizacao", mensagem_sefaz: "Rejeição: NCM inválido" })).toEqual({ status: "rejeitada", mensagem: "Rejeição: NCM inválido" });
  });
});
