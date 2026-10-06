import { z } from "zod";
import { MAX_ITENS, MAX_QTD, type ItemCarrinhoVitrine } from "./vitrine-pedido";

/**
 * Formato exato devolvido por `obter_catalogo_publico` (migração 0033). Quando o catálogo
 * existe mas não tem produto elegível, vem uma única linha com `produto_id` nulo.
 *
 * `preco` nulo significa **"Consultar"**: o produto aparece, mas não vira pedido.
 */
export interface LinhaCatalogoPublico {
  catalogo_nome: string;
  produto_id: string | null;
  produto_nome: string | null;
  grupo_id: string | null;
  grupo_nome: string | null;
  variante_nome: string | null;
  descricao: string | null;
  imagem_url: string | null;
  categoria_nome: string | null;
  preco: number | null;
  imagens_extra: string[] | null;
  negocio_whatsapp: string | null;
  /** 1 = mais vendido nos últimos 90 dias. Só a posição — a quantidade não é pública. */
  ordem_popularidade: number | null;
  catalogo_tipo_preco: "varejo" | "atacado" | null;
}

/** Uma variante vendável dentro de um item da vitrine. `preco` nulo = Consultar. */
export interface VarianteVitrine {
  produto_id: string;
  variante_nome: string | null;
  preco: number | null;
  imagem_url: string | null;
  imagens_extra: string[];
}

/**
 * Um item de verdade, já agrupado — o que a vitrine renderiza. A RPC devolve uma linha por
 * SKU; produtos do mesmo grupo viram UM item com várias `variantes`, e o card mostra o
 * menor preço entre as que têm preço.
 */
export interface ItemVitrine {
  produto_id: string;
  produto_nome: string;
  descricao: string | null;
  imagem_url: string | null;
  categoria_nome: string | null;
  /** Menor preço entre as variantes que têm preço; null quando TODAS são "Consultar". */
  preco: number | null;
  imagens_extra: string[];
  variantes: VarianteVitrine[];
  /** Melhor (menor) posição de popularidade entre as variantes. Sem vendas = fim da fila. */
  ordem: number;
}

const SEM_VENDAS = 1_000_000;

/** Agrupa as linhas da RPC (uma por SKU) em itens da vitrine. */
export function agruparLinhas(linhas: LinhaCatalogoPublico[]): ItemVitrine[] {
  const porChave = new Map<string, ItemVitrine>();

  for (const linha of linhas) {
    if (linha.produto_id === null || linha.produto_nome === null) continue;

    const variante: VarianteVitrine = {
      produto_id: linha.produto_id,
      variante_nome: linha.variante_nome,
      preco: linha.preco,
      imagem_url: linha.imagem_url,
      imagens_extra: linha.imagens_extra ?? [],
    };
    const ordem = linha.ordem_popularidade ?? SEM_VENDAS;
    const chave = linha.grupo_id ?? linha.produto_id;
    const existente = porChave.get(chave);

    if (existente) {
      existente.variantes.push(variante);
      if (variante.preco !== null && (existente.preco === null || variante.preco < existente.preco)) {
        existente.preco = variante.preco;
      }
      existente.imagem_url = existente.imagem_url ?? variante.imagem_url;
      existente.ordem = Math.min(existente.ordem, ordem);
      continue;
    }

    porChave.set(chave, {
      produto_id: chave,
      produto_nome: linha.produto_nome,
      descricao: linha.descricao,
      imagem_url: linha.imagem_url,
      categoria_nome: linha.categoria_nome,
      preco: linha.preco,
      imagens_extra: linha.imagens_extra ?? [],
      variantes: [variante],
      ordem,
    });
  }

  return [...porChave.values()];
}

export type Ordenacao = "populares" | "menor" | "maior" | "nome";

export const ORDENACOES: { id: Ordenacao; label: string }[] = [
  { id: "populares", label: "Mais pedidos" },
  { id: "menor", label: "Menor preço" },
  { id: "maior", label: "Maior preço" },
  { id: "nome", label: "A–Z" },
];

export interface FiltrosVitrine {
  busca: string;
  /** "Todas" ou o nome da categoria. */
  categoria: string;
  ordenacao: Ordenacao;
  precoMin: number | null;
  precoMax: number | null;
}

export const FILTROS_PADRAO: FiltrosVitrine = {
  busca: "",
  categoria: "Todas",
  ordenacao: "populares",
  precoMin: null,
  precoMax: null,
};

export function filtrosAtivos(f: FiltrosVitrine): boolean {
  return (
    f.busca.trim() !== "" || f.categoria !== "Todas" || f.precoMin !== null || f.precoMax !== null
  );
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Filtra e ordena. "Consultar" não tem preço para comparar: some quando há filtro de preço
 * ativo e vai para o fim nas ordenações por preço — nunca fica no meio, como se custasse 0.
 */
export function aplicarFiltros(itens: ItemVitrine[], f: FiltrosVitrine): ItemVitrine[] {
  const termo = semAcento(f.busca.trim());
  const comFiltroDePreco = f.precoMin !== null || f.precoMax !== null;

  const filtrados = itens.filter((item) => {
    if (f.categoria !== "Todas" && (item.categoria_nome ?? "Outros") !== f.categoria) return false;
    if (termo && !semAcento(item.produto_nome).includes(termo)) return false;
    if (comFiltroDePreco) {
      if (item.preco === null) return false;
      if (f.precoMin !== null && item.preco < f.precoMin) return false;
      if (f.precoMax !== null && item.preco > f.precoMax) return false;
    }
    return true;
  });

  const porNome = (a: ItemVitrine, b: ItemVitrine) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR");
  const copia = [...filtrados];

  if (f.ordenacao === "menor" || f.ordenacao === "maior") {
    const sinal = f.ordenacao === "menor" ? 1 : -1;
    return copia.sort((a, b) => {
      if (a.preco === null && b.preco === null) return porNome(a, b);
      if (a.preco === null) return 1;
      if (b.preco === null) return -1;
      return sinal * (a.preco - b.preco) || porNome(a, b);
    });
  }
  if (f.ordenacao === "nome") return copia.sort(porNome);
  return copia.sort((a, b) => a.ordem - b.ordem || porNome(a, b));
}

/** Categorias com a contagem ao lado ("Todas" primeiro), para a barra lateral. */
export function categoriasComContagem(itens: ItemVitrine[]): { nome: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const i of itens) {
    const c = i.categoria_nome ?? "Outros";
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  return [
    { nome: "Todas", total: itens.length },
    ...[...contagem.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([nome, total]) => ({ nome, total })),
  ];
}

/** Menor e maior preço do catálogo (só itens com preço). */
export function limitesDePreco(itens: ItemVitrine[]): { min: number; max: number } | null {
  const precos = itens.map((i) => i.preco).filter((p): p is number => p !== null);
  if (precos.length === 0) return null;
  return { min: Math.min(...precos), max: Math.max(...precos) };
}

// ---------- Carrinho salvo / compartilhado ----------

const uuid = z.string().uuid();

const itemCompartilhadoSchema = z.tuple([uuid, z.number().int().min(1).max(MAX_QTD)]);
const carrinhoCompartilhadoSchema = z.array(itemCompartilhadoSchema).min(1).max(MAX_ITENS);

export interface ItemCompartilhado {
  produto_id: string;
  quantidade: number;
}

/**
 * Código do carrinho para o link de compartilhar: só ids e quantidades. **Preço nunca vai
 * no link** — quem abre reconstrói o carrinho com os preços do catálogo naquele momento.
 */
export function codificarCarrinho(itens: ItemCompartilhado[]): string {
  const json = JSON.stringify(itens.map((i) => [i.produto_id, i.quantidade]));
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Devolve `[]` para qualquer código inválido — link estragado nunca deve derrubar a página. */
export function decodificarCarrinho(codigo: string | null | undefined): ItemCompartilhado[] {
  if (!codigo || codigo.length > 4000) return [];
  try {
    const padded = codigo.replace(/-/g, "+").replace(/_/g, "/");
    const bruto = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
    const analise = carrinhoCompartilhadoSchema.safeParse(bruto);
    if (!analise.success) return [];
    return analise.data.map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
  } catch {
    return [];
  }
}

function rotuloDaVariante(item: ItemVitrine, v: VarianteVitrine): string {
  return v.variante_nome ? `${item.produto_nome} — ${v.variante_nome}` : item.produto_nome;
}

/**
 * Reconstrói o carrinho a partir de ids + quantidades usando o catálogo ATUAL: nome e preço
 * vêm do banco, produto que saiu do catálogo ou virou "Consultar" cai fora em silêncio.
 * Ao contrário do que estiver salvo no navegador ou no link, o preço aqui é sempre o de hoje.
 */
export function montarCarrinho(pedido: ItemCompartilhado[], itens: ItemVitrine[]): ItemCarrinhoVitrine[] {
  const achados = new Map<string, { item: ItemVitrine; variante: VarianteVitrine }>();
  for (const item of itens) for (const variante of item.variantes) achados.set(variante.produto_id, { item, variante });

  const carrinho = new Map<string, ItemCarrinhoVitrine>();
  for (const { produto_id, quantidade } of pedido) {
    const achado = achados.get(produto_id);
    const preco = achado?.variante.preco ?? null;
    if (!achado || preco === null) continue;
    const { item, variante } = achado;

    const opcoes = item.variantes
      .filter((v): v is VarianteVitrine & { preco: number } => v.preco !== null)
      .map((v) => ({ produto_id: v.produto_id, rotulo: v.variante_nome ?? "Padrão", preco: v.preco }));

    const existente = carrinho.get(produto_id);
    if (existente) {
      existente.quantidade = Math.min(MAX_QTD, existente.quantidade + quantidade);
    } else {
      carrinho.set(produto_id, {
        produto_id,
        nome: rotuloDaVariante(item, variante),
        nomeBase: item.produto_nome,
        preco,
        quantidade,
        opcoes: opcoes.length > 1 ? opcoes : undefined,
      });
    }
  }
  return [...carrinho.values()].slice(0, MAX_ITENS);
}

/** Troca a variante de uma linha do carrinho (mesmo produto, outra opção). */
export function trocarVariante(item: ItemCarrinhoVitrine, novoProdutoId: string): ItemCarrinhoVitrine {
  const opcao = item.opcoes?.find((o) => o.produto_id === novoProdutoId);
  if (!opcao) return item;
  const base = item.nomeBase ?? item.nome;
  return {
    ...item,
    produto_id: opcao.produto_id,
    nome: opcao.rotulo === "Padrão" ? base : `${base} — ${opcao.rotulo}`,
    preco: opcao.preco,
  };
}

/** Mensagem do botão "Consultar": abre o WhatsApp da loja perguntando pelo produto. */
export function textoConsultarProduto(nomeProduto: string, nomeCatalogo: string, variante?: string | null): string {
  const item = variante ? `${nomeProduto} (${variante})` : nomeProduto;
  return `Olá! Vi "${item}" no catálogo ${nomeCatalogo} e gostaria de saber o preço e a disponibilidade.`;
}

// ---------- Compre junto (Fase 5, onda B) ----------

/** Linha de `compre_junto_publico` (0075): posição 1 = o par que mais saiu junto. */
export interface ParCompreJunto {
  produto_id: string;
  relacionado_id: string;
  posicao: number;
}

/**
 * Até `max` itens para oferecer junto com `alvo`: primeiro os que saíram no mesmo pedido
 * (pares da 0075, de qualquer variante do item), depois — para completar ou quando ainda não
 * há vendas juntas — os mais vendidos da mesma categoria e, por fim, os mais vendidos da
 * loja. Só itens com preço (dá para pôr no carrinho) e nunca o próprio item.
 */
export function sugestoesCompreJunto(itens: ItemVitrine[], pares: ParCompreJunto[], alvo: ItemVitrine, max = 3): ItemVitrine[] {
  const itemDoProduto = new Map<string, ItemVitrine>();
  for (const it of itens) for (const v of it.variantes) itemDoProduto.set(v.produto_id, it);
  const doAlvo = new Set(alvo.variantes.map((v) => v.produto_id));
  const escolhidos: ItemVitrine[] = [];
  const vistos = new Set<string>([alvo.produto_id]);
  const pegar = (it: ItemVitrine | undefined) => {
    if (!it || vistos.has(it.produto_id) || it.preco === null || escolhidos.length >= max) return;
    vistos.add(it.produto_id);
    escolhidos.push(it);
  };
  [...pares]
    .filter((p) => doAlvo.has(p.produto_id))
    .sort((a, b) => a.posicao - b.posicao)
    .forEach((p) => pegar(itemDoProduto.get(p.relacionado_id)));
  if (alvo.categoria_nome)
    itens
      .filter((it) => it.categoria_nome === alvo.categoria_nome)
      .sort((a, b) => a.ordem - b.ordem)
      .forEach(pegar);
  [...itens].sort((a, b) => a.ordem - b.ordem).forEach(pegar);
  return escolhidos;
}
