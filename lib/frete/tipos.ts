/**
 * Frete (Fase 10.6): tipos, montagem do pacote e regras da loja, sem depender do provedor.
 * O Melhor Envio é a primeira implementação (`melhor-envio.ts`); outro provedor (SuperFrete)
 * entra implementando `ProvedorFrete`, sem mexer em tela nem em regra.
 */

export type ProvedorId = "melhorenvio";

export interface Pacote {
  /** kg */
  peso: number;
  /** cm */
  altura: number;
  largura: number;
  comprimento: number;
}

export interface Cotacao {
  /** Id do serviço no provedor (ex.: 1 = PAC no Melhor Envio). */
  servicoId: number;
  servico: string;
  transportadora: string;
  valor: number;
  prazoDias: number | null;
}

export interface ItemPacote {
  nome: string;
  quantidade: number;
  peso_g: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  comprimento_cm: number | null;
}

/** Produto sem medida: o que se assume (uma caixinha pequena), e a tela avisa. */
export const PADRAO_ITEM = { peso_g: 300, altura_cm: 4, largura_cm: 11, comprimento_cm: 16 } as const;
/** Mínimos dos Correios/Melhor Envio. */
const MINIMO = { altura: 2, largura: 11, comprimento: 16, peso: 0.1 };
const MAXIMO_LADO = 100;

/**
 * Um volume para o pedido: base = a maior largura e o maior comprimento, altura = soma das
 * alturas (itens empilhados), peso = soma. Respeita os mínimos e avisa quem não tem medida.
 */
export function montarPacote(itens: ItemPacote[]): { pacote: Pacote; semMedida: string[] } {
  const semMedida: string[] = [];
  let peso = 0;
  let altura = 0;
  let largura = 0;
  let comprimento = 0;
  for (const i of itens) {
    const q = Math.max(1, Math.floor(i.quantidade));
    if (!i.peso_g || !i.altura_cm || !i.largura_cm || !i.comprimento_cm) semMedida.push(i.nome);
    const pg = i.peso_g ?? PADRAO_ITEM.peso_g;
    const a = Number(i.altura_cm ?? PADRAO_ITEM.altura_cm);
    const l = Number(i.largura_cm ?? PADRAO_ITEM.largura_cm);
    const c = Number(i.comprimento_cm ?? PADRAO_ITEM.comprimento_cm);
    peso += (pg * q) / 1000;
    altura += a * q;
    largura = Math.max(largura, l);
    comprimento = Math.max(comprimento, c);
  }
  const arred = (n: number) => Math.round(n * 10) / 10;
  return {
    pacote: {
      peso: Math.max(MINIMO.peso, Math.round(peso * 1000) / 1000),
      altura: arred(Math.min(MAXIMO_LADO, Math.max(MINIMO.altura, altura))),
      largura: arred(Math.min(MAXIMO_LADO, Math.max(MINIMO.largura, largura))),
      comprimento: arred(Math.min(MAXIMO_LADO, Math.max(MINIMO.comprimento, comprimento))),
    },
    semMedida: [...new Set(semMedida)],
  };
}

export interface RegrasFrete {
  /** Serviços aceitos (vazio = todos). */
  servicos: number[];
  /** R$ somados a cada cotação (embalagem, manuseio). */
  acrescimo: number;
  /** Subtotal a partir do qual o mais barato sai de graça (null = nunca). */
  freteGratisAcima: number | null;
}

/**
 * Aplica as regras da loja: filtra serviços, soma o acréscimo e zera o mais barato acima do
 * valor de frete grátis. Ordena do mais barato ao mais caro.
 */
export function aplicarRegras(cotacoes: Cotacao[], regras: RegrasFrete, subtotal: number): (Cotacao & { gratis: boolean })[] {
  const aceitas = cotacoes
    .filter((c) => !regras.servicos.length || regras.servicos.includes(c.servicoId))
    .map((c) => ({ ...c, valor: Math.round((c.valor + Math.max(0, regras.acrescimo)) * 100) / 100, gratis: false }))
    .sort((a, b) => a.valor - b.valor || (a.prazoDias ?? 99) - (b.prazoDias ?? 99));
  if (regras.freteGratisAcima != null && subtotal >= regras.freteGratisAcima && aceitas.length) aceitas[0] = { ...aceitas[0], valor: 0, gratis: true };
  return aceitas;
}

export const soDigitosCep = (cep: string) => cep.replace(/\D/g, "").slice(0, 8);
export const cepValido = (cep: string) => soDigitosCep(cep).length === 8;

export interface ProvedorFrete {
  cotar(entrada: { origem: string; destino: string; pacote: Pacote; valorDeclarado: number }): Promise<Cotacao[]>;
}
