export const contas = [
  { id: "cta1", nome: "Banco Inter PJ", saldo: 24150.0, detalhe: "Conta Corrente PJ" },
  { id: "cta2", nome: "Shopee Pay — Perfumes & Couro", saldo: 8920.15, detalhe: "Repasses automáticos" },
  { id: "cta3", nome: "Shopee Pay — Moto Parts", saldo: 5350.0, detalhe: "Repasses automáticos" },
];

export const vencimentos = [
  {
    status: "Vence hoje",
    tone: "negative" as const,
    vencimento: "24/10/2024",
    tipo: "A Pagar",
    descricao: "Fornecedor Fragrâncias BR",
    detalhe: "Boleto #84920 — Lote Essências 500ml",
    loja: "Perfumes & Couro",
    valor: -3420.0,
  },
  {
    status: "Vence amanhã",
    tone: "negative" as const,
    vencimento: "25/10/2024",
    tipo: "A Pagar",
    descricao: "Embalagens Express SP",
    detalhe: "NF-e 1204 — 500 Caixas Envio P",
    loja: "Ambas as Lojas",
    valor: -680.5,
  },
  {
    status: "Em 3 dias",
    tone: "positive" as const,
    vencimento: "27/10/2024",
    tipo: "A Receber",
    descricao: "Repasse Shopee Oficial",
    detalhe: "Ciclo quinzenal — Vendas 08 a 22/10",
    loja: "Perfumes & Couro",
    valor: 6140.2,
  },
  {
    status: "Programado",
    tone: "neutral" as const,
    vencimento: "30/10/2024",
    tipo: "A Pagar",
    descricao: "Distribuidora Aliança Peças",
    detalhe: "Fatura 551 — Pastilhas e Cabos de Freio",
    loja: "Moto Parts",
    valor: -1950.0,
  },
];

export const fornecedores = [
  {
    id: "f1",
    nome: "Couro Real SP Ltda",
    cnpj: "45.102.883/0001-92",
    contato: "Carlos Eduardo Melo",
    telefone: "(16) 99234-8810",
    cidade: "Franca / SP",
    prazo: "28 dias boleto",
    status: "ativo" as const,
  },
  {
    id: "f2",
    nome: "Aroma Brasil Essências",
    cnpj: "19.340.118/0002-14",
    contato: "Juliana Prado",
    telefone: "(19) 98721-4490",
    cidade: "Campinas / SP",
    prazo: "14 dias boleto",
    status: "ativo" as const,
  },
  {
    id: "f3",
    nome: "Ciclo Peças Distribuidora",
    cnpj: "08.991.432/0001-07",
    contato: "Roberto Zanin",
    telefone: "(11) 97120-0388",
    cidade: "São Paulo / SP",
    prazo: "21 / 28 dias",
    status: "ativo" as const,
  },
  {
    id: "f4",
    nome: "Embalagens Express EmbaFlex",
    cnpj: "31.782.901/0001-55",
    contato: "Marcos Vinicius",
    telefone: "(11) 96431-9082",
    cidade: "Guarulhos / SP",
    prazo: "À vista PIX",
    status: "ativo" as const,
  },
  {
    id: "f5",
    nome: "Norte Metais & Acessórios",
    cnpj: "02.441.080/0001-61",
    contato: "Fernando Dias",
    telefone: "(11) 94012-3301",
    cidade: "Limeira / SP",
    prazo: "Antecipado 100%",
    status: "inativo" as const,
  },
];

export const armazens = [
  {
    id: "a1",
    nome: "Galpão Central",
    endereco: "Rua das Indústrias, 450 — Franca / SP",
    lojasAbastecidas: ["Perfumaria & Couro"],
  },
  {
    id: "a2",
    nome: "Depósito Moto Parts",
    endereco: "Av. dos Mecânicos, 120 — Campinas / SP",
    lojasAbastecidas: ["Moto & Bike Parts"],
  },
];

export interface Produto {
  sku: string;
  nome: string;
  categoria: string;
  fornecedor: string;
  custo: number;
  precoVenda: number;
  precoAtacado: number | null;
  codigoBarras: string | null;
  estoque: number;
  estoqueMinimo: number;
  saidaMediaSemanal: number;
  armazemId: string;
  imagemUrl: string | null;
  ativo: boolean;
}

export const produtos: Produto[] = [
  {
    sku: "PRF-0921",
    nome: "Perfume Âmbar & Cedro 100ml",
    categoria: "Perfumaria",
    fornecedor: "Aromas do Sul Ltda",
    custo: 42.5,
    precoVenda: 89.9,
    precoAtacado: 74.9,
    codigoBarras: null,
    estoque: 142,
    estoqueMinimo: 40,
    saidaMediaSemanal: 14,
    armazemId: "a1",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "COU-1104",
    nome: "Carteira Slim Couro Legítimo Preto",
    categoria: "Couro",
    fornecedor: "Couros Nobre Vera",
    custo: 28.0,
    precoVenda: 69.9,
    precoAtacado: 54.9,
    codigoBarras: null,
    estoque: 84,
    estoqueMinimo: 25,
    saidaMediaSemanal: 9,
    armazemId: "a1",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "MOT-4402",
    nome: "Pastilha Freio Traseira Titan 160",
    categoria: "Moto & Bike",
    fornecedor: "Distribuidora Veloce",
    custo: 14.9,
    precoVenda: 34.9,
    precoAtacado: null,
    codigoBarras: null,
    estoque: 18,
    estoqueMinimo: 30,
    saidaMediaSemanal: 11,
    armazemId: "a2",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "EMB-0112",
    nome: "Envelope Segurança Bolha 19x25cm (Fardo 100un)",
    categoria: "Embalagens",
    fornecedor: "Pack Express Insumos",
    custo: 38.2,
    precoVenda: 59.9,
    precoAtacado: 49.9,
    codigoBarras: null,
    estoque: 36,
    estoqueMinimo: 20,
    saidaMediaSemanal: 5,
    armazemId: "a1",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "COU-3301",
    nome: "Cinto Social Couro Bovino Dupla Face",
    categoria: "Couro",
    fornecedor: "Couros Nobre Vera",
    custo: 34.9,
    precoVenda: 79.9,
    precoAtacado: 64.9,
    codigoBarras: null,
    estoque: 47,
    estoqueMinimo: 15,
    saidaMediaSemanal: 6,
    armazemId: "a1",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "PRF-1029",
    nome: "Óleo Essencial Lavanda Francesa",
    categoria: "Perfumaria",
    fornecedor: "Aromas do Sul Ltda",
    custo: 18.75,
    precoVenda: 39.9,
    precoAtacado: null,
    codigoBarras: null,
    estoque: 9,
    estoqueMinimo: 20,
    saidaMediaSemanal: 7,
    armazemId: "a1",
    imagemUrl: null,
    ativo: true,
  },
  {
    sku: "MOT-1021",
    nome: "Mini Bomba Alumínio Alta Pressão",
    categoria: "Moto & Bike",
    fornecedor: "Distribuidora Veloce",
    custo: 19.23,
    precoVenda: 44.9,
    precoAtacado: 36.9,
    codigoBarras: null,
    estoque: 56,
    estoqueMinimo: 20,
    saidaMediaSemanal: 4,
    armazemId: "a2",
    imagemUrl: null,
    ativo: true,
  },
];

export interface ItemPedidoCompra {
  produto: string;
  quantidade: number;
  custoUnitario: number;
}

export interface PedidoCompra {
  numero: string;
  fornecedor: string;
  cnpj: string;
  loja: string;
  data: string;
  dataRecebimento: string | null;
  nf: string | null;
  qtd: number;
  valor: number;
  status: "pendente" | "recebido";
  itens: ItemPedidoCompra[];
}

export const pedidosCompra: PedidoCompra[] = [
  {
    numero: "PC-2024-038",
    fornecedor: "Couro Real SP",
    cnpj: "42.190.281/0001-44",
    loja: "Perfumes & Couro",
    data: "22/10/2024",
    dataRecebimento: null,
    nf: "8921",
    qtd: 140,
    valor: 3840.0,
    status: "pendente",
    itens: [
      { produto: "Carteira Slim Couro Legítimo Preto", quantidade: 100, custoUnitario: 24.0 },
      { produto: "Cinto Social Couro Bovino Dupla Face", quantidade: 40, custoUnitario: 24.0 },
    ],
  },
  {
    numero: "PC-2024-039",
    fornecedor: "Veloce Imports",
    cnpj: "18.234.901/0002-19",
    loja: "Moto Parts",
    data: "23/10/2024",
    dataRecebimento: null,
    nf: null,
    qtd: 32,
    valor: 980.0,
    status: "pendente",
    itens: [{ produto: "Pastilha Freio Traseira Titan 160", quantidade: 32, custoUnitario: 30.63 }],
  },
  {
    numero: "PC-2024-037",
    fornecedor: "Aroma Brasil",
    cnpj: "09.382.110/0001-83",
    loja: "Perfumes & Couro",
    data: "19/10/2024",
    dataRecebimento: "21/10/2024",
    nf: "4492",
    qtd: 50,
    valor: 980.0,
    status: "recebido",
    itens: [{ produto: "Óleo Essencial Lavanda Francesa", quantidade: 50, custoUnitario: 19.6 }],
  },
  {
    numero: "PC-2024-036",
    fornecedor: "Ciclo Peças Express",
    cnpj: "30.120.778/0001-05",
    loja: "Moto Parts",
    data: "15/10/2024",
    dataRecebimento: "18/10/2024",
    nf: "1104",
    qtd: 65,
    valor: 1250.0,
    status: "recebido",
    itens: [{ produto: "Mini Bomba Alumínio Alta Pressão", quantidade: 65, custoUnitario: 19.23 }],
  },
  {
    numero: "PC-2024-035",
    fornecedor: "Essências do Sul Ltda",
    cnpj: "55.441.200/0001-92",
    loja: "Perfumes & Couro",
    data: "12/10/2024",
    dataRecebimento: "14/10/2024",
    nf: "902",
    qtd: 200,
    valor: 5120.0,
    status: "recebido",
    itens: [{ produto: "Perfume Âmbar & Cedro 100ml", quantidade: 200, custoUnitario: 25.6 }],
  },
];

export const movimentacoesEstoque = [
  { sku: "PRF-0921", data: "Hoje 14:22", produto: "Perfume Âmbar & Cedro 100ml", tipo: "saida" as const, quantidade: 2, motivo: "Venda #SHP-9921" },
  { sku: "COU-1104", data: "Hoje 11:05", produto: "Carteira Slim Couro Legítimo Preto", tipo: "entrada" as const, quantidade: 80, motivo: "Pedido de compra NF 4492" },
  { sku: "PRF-0921", data: "Hoje 09:41", produto: "Perfume Âmbar & Cedro 100ml", tipo: "saida" as const, quantidade: 1, motivo: "Frasco danificado" },
  { sku: "COU-3301", data: "Hoje 08:15", produto: "Cinto Social Couro Bovino Dupla Face", tipo: "entrada" as const, quantidade: 15, motivo: "Montagem de kit" },
  { sku: "PRF-1029", data: "Ontem 17:30", produto: "Óleo Essencial Lavanda Francesa", tipo: "saida" as const, quantidade: 3, motivo: "Venda #SHP-9887" },
];

export const movimentacoesFinanceiras = [
  {
    vencimento: "24/10 (Hoje)",
    descricao: "Boleto Couro Real SP",
    origem: "#BL-88012",
    categoria: "Matéria-prima",
    conta: "Itaú Operacional",
    valor: -2450.0,
    afetaLucro: false,
  },
  {
    vencimento: "25/10/2024",
    descricao: "Repasse Shopee Loja 1",
    origem: "Ciclo 18-24 Out",
    categoria: "Receita vendas",
    conta: "Conta PJ Cora",
    valor: 3890.2,
    afetaLucro: true,
  },
  {
    vencimento: "26/10/2024",
    descricao: "Embalagens EmbaFlex",
    origem: "NF-e 14203",
    categoria: "Insumos / Envios",
    conta: "Itaú Operacional",
    valor: -480.0,
    afetaLucro: true,
  },
  {
    vencimento: "31/10/2024",
    descricao: "DAS Simples Nacional",
    origem: "Guia Fiscal Mensal",
    categoria: "Tributos",
    conta: "Conta PJ Cora",
    valor: -2874.6,
    afetaLucro: true,
  },
];

export const vendasDiarias = [
  { dia: "18", vendas: 1420 },
  { dia: "19", vendas: 1680 },
  { dia: "20", vendas: 980 },
  { dia: "21", vendas: 2050 },
  { dia: "22", vendas: 1750 },
  { dia: "23", vendas: 2310 },
  { dia: "24", vendas: 1845 },
];

export const fluxoCaixaDiario = [
  { dia: "01", entradas: 1200, saidas: 400 },
  { dia: "04", entradas: 1800, saidas: 900 },
  { dia: "07", entradas: 900, saidas: 600 },
  { dia: "10", entradas: 2600, saidas: 1400 },
  { dia: "13", entradas: 1500, saidas: 700 },
  { dia: "16", entradas: 2100, saidas: 1100 },
  { dia: "19", entradas: 1700, saidas: 950 },
  { dia: "22", entradas: 2900, saidas: 1600 },
  { dia: "25", entradas: 2000, saidas: 1200 },
  { dia: "28", entradas: 2400, saidas: 1350 },
];

export const despesasPorCategoria = [
  { categoria: "Matéria-prima", valor: 2450.0 },
  { categoria: "Insumos / Envios", valor: 480.0 },
  { categoria: "Tributos", valor: 2874.6 },
  { categoria: "Despesas fixas", valor: 2559.9 },
];

export const despesasFixas = [
  { nome: "Internet / Telefonia Escritório", metodo: "Débito em conta (Itaú)", valor: 189.9, dia: 5, status: "pago" as const },
  { nome: "Software Etiquetas Upseller", metodo: "Débito Cartão Crédito", valor: 120.0, dia: 12, status: "pago" as const },
  { nome: "Contador PJ Contábil", metodo: "Boleto manual", valor: 450.0, dia: 15, status: "pago" as const },
  { nome: "Aluguel Espaço / Estoque Moto & Couro", metodo: "Boleto manual", valor: 1800.0, dia: 10, status: "pago" as const },
];

export interface ContaPagarReceber {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  vencimento: string;
  status: "pendente" | "pago" | "recebido";
  conta: string;
}

export const contasPagarReceber: ContaPagarReceber[] = [
  { id: "cpr1", tipo: "pagar", descricao: "Fornecedor Fragrâncias BR — Boleto #84920", valor: 3420.0, vencimento: "24/10/2024", status: "pendente", conta: "Itaú Operacional" },
  { id: "cpr2", tipo: "pagar", descricao: "Embalagens Express SP — NF-e 1204", valor: 680.5, vencimento: "25/10/2024", status: "pendente", conta: "Itaú Operacional" },
  { id: "cpr3", tipo: "receber", descricao: "Repasse Shopee Oficial — Ciclo 08 a 22/10", valor: 6140.2, vencimento: "27/10/2024", status: "pendente", conta: "Shopee Pay — Perfumes & Couro" },
  { id: "cpr4", tipo: "pagar", descricao: "Distribuidora Aliança Peças — Fatura 551", valor: 1950.0, vencimento: "30/10/2024", status: "pendente", conta: "Itaú Operacional" },
  { id: "cpr5", tipo: "receber", descricao: "Repasse Shopee — Ciclo 23/09 a 07/10", valor: 5820.0, vencimento: "08/10/2024", status: "recebido", conta: "Shopee Pay — Moto Parts" },
  { id: "cpr6", tipo: "pagar", descricao: "Contador PJ Contábil — Mensalidade", valor: 450.0, vencimento: "15/10/2024", status: "pago", conta: "Conta PJ Cora" },
];

export const precificacoesHistorico = [
  { data: "24/10/2024", produto: "Kit Cuidados Barba & Couro", canal: "Shopee (20% + R$4)", custo: 41.5, preco: 99.9, lucro: 28.43, margem: 28.5 },
  { data: "22/10/2024", produto: "Óleo para Barba Rústica 30ml", canal: "Shopee (20% + R$4)", custo: 10.8, preco: 29.9, lucro: 9.13, margem: 30.5 },
  { data: "18/10/2024", produto: "Balm Modelador Premium 60g", canal: "Mercado Livre (14% + R$6)", custo: 13.5, preco: 38.0, lucro: 11.82, margem: 31.1 },
  { data: "12/10/2024", produto: "Estojo de Couro Rustik Solo", canal: "Loja Própria (3%)", custo: 21.5, preco: 54.0, lucro: 27.15, margem: 50.2 },
];

export const canaisVenda = [
  { id: "canal1", nome: "Perfumaria & Couro", plataforma: "Shopee", comissaoPct: 20, taxaFixa: 4, ciclo: "D+3 após entrega" },
  { id: "canal2", nome: "Moto & Bike Parts", plataforma: "Shopee", comissaoPct: 20, taxaFixa: 4, ciclo: "D+3 após entrega" },
];

export const categorias = [
  { id: "cat1", nome: "Perfumaria & Barba", skus: 42 },
  { id: "cat2", nome: "Artigos de Couro", skus: 19 },
  { id: "cat3", nome: "Moto & Bike", skus: 88 },
  { id: "cat4", nome: "Embalagens & Insumos", skus: 11 },
];

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
