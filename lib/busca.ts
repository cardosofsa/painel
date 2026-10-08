/**
 * Busca global (Ctrl+K). PURO, coberto por `busca.test.ts`.
 *
 * O termo vai para um filtro `or(...)` do PostgREST: vírgula, parênteses e aspas quebram a
 * sintaxe (e poderiam montar outro filtro), `*`/`%`/`_` viram curinga. Fica só o que alguém
 * digita para achar produto, cliente ou pedido: letras, números, espaço e - . / @ +.
 */
export function termoBusca(q: string): string {
  return q
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} \-./@+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Comparação sem acento e sem caixa, para filtrar as telas do menu. */
export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface AtalhoTela {
  rotulo: string;
  href: string;
  /** Aba que libera o atalho (lib/acesso.ts). */
  aba: string;
  /** Palavras que também acham o atalho. */
  sinonimos?: string;
}

/** Telas e seções que valem um atalho, além dos itens do menu lateral. */
export const ATALHOS_EXTRAS: AtalhoTela[] = [
  { rotulo: "Relatórios de vendas", href: "/vendas/relatorios", aba: "vendas", sinonimos: "curva abc lucro por produto estado" },
  { rotulo: "Financeiro · A pagar", href: "/financeiro?aba=a-pagar", aba: "financeiro", sinonimos: "contas fornecedor boleto" },
  { rotulo: "Financeiro · A receber", href: "/financeiro?aba=a-receber", aba: "financeiro", sinonimos: "crediario fiado" },
  { rotulo: "Financeiro · Resultado do mês", href: "/financeiro?aba=resultado", aba: "financeiro", sinonimos: "dre lucro liquido anuncios ads" },
  { rotulo: "Financeiro · Histórico de pagamentos", href: "/financeiro?aba=historico", aba: "financeiro" },
  { rotulo: "Valor do estoque", href: "/estoque/valor", aba: "estoque", sinonimos: "giro parados cobertura" },
  { rotulo: "Vixe · Alertas", href: "/vixe", aba: "vixe" },
  { rotulo: "Vixe · Preço", href: "/vixe/preco", aba: "vixe" },
  { rotulo: "Vixe · Textos", href: "/vixe/textos", aba: "vixe", sinonimos: "ia descricao titulo cobranca" },
  { rotulo: "Vixe · Radar", href: "/vixe/radar", aba: "vixe", sinonimos: "prejuizo margem baixa" },
  { rotulo: "Vixe · Mensagens", href: "/vixe/mensagens", aba: "vixe", sinonimos: "whatsapp" },
  { rotulo: "Configurações · Pix e crediário", href: "/configuracoes?aba=conta", aba: "configuracoes", sinonimos: "juros multa chave pix" },
  { rotulo: "Configurações · Canais de venda", href: "/configuracoes?aba=canais-de-venda", aba: "configuracoes", sinonimos: "shopee mercado livre conectar" },
  { rotulo: "Configurações · Plano", href: "/configuracoes?aba=plano", aba: "configuracoes", sinonimos: "assinatura upgrade" },
  { rotulo: "Configurações · Equipe", href: "/configuracoes?aba=equipe", aba: "configuracoes", sinonimos: "operador pin comissao" },
  { rotulo: "Configurações · Fiscal", href: "/configuracoes?aba=fiscal", aba: "configuracoes", sinonimos: "nfe nota fiscal" },
  { rotulo: "Configurações · Frete", href: "/configuracoes?aba=frete", aba: "configuracoes", sinonimos: "melhor envio etiqueta" },
];

export function filtrarAtalhos(atalhos: AtalhoTela[], q: string): AtalhoTela[] {
  const t = normalizarBusca(q);
  if (!t) return atalhos;
  const partes = t.split(/\s+/);
  return atalhos.filter((a) => {
    const alvo = normalizarBusca(`${a.rotulo} ${a.sinonimos ?? ""}`);
    return partes.every((p) => alvo.includes(p));
  });
}
