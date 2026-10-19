/**
 * Criar anúncio na Shopee como NÃO LISTADO (Estúdio de anúncios, fase 4).
 *
 * Parte PURA (pode ir ao navegador): montar o corpo do `add_item`, conferir o que falta, ler as
 * respostas e traduzir erros. Coberta por `shopee-criar.test.ts`. As chamadas de rede ficam em
 * `shopee-criar.ts`, que só chama os helpers que o Painel já usa (`getLoja`, `postLoja`).
 *
 * ATENÇÃO — o que NÃO foi confirmado na documentação oficial (páginas dinâmicas, não deu para
 * ler): os valores aceitos em `item_status` no `add_item`. Por isso o fluxo nunca presume que
 * "não listado" funcionou: depois de criar, lê o item (`get_item_base_info`) e, se não vier
 * não listado, chama `unlist_item` na hora e avisa. Nunca se cria como listado de propósito.
 */

export const STATUS_NAO_LISTADO = "UNLIST";
/** A Shopee aceita até 9 imagens por anúncio. */
export const MAX_IMAGENS = 9;

export interface CategoriaShopee {
  id: number;
  paiId: number;
  nome: string;
  temFilhas: boolean;
}

export interface ValorAtributo {
  id: number;
  nome: string;
}

export interface AtributoShopee {
  id: number;
  nome: string;
  obrigatorio: boolean;
  tipo: "lista" | "multipla" | "texto" | "numero";
  valores: ValorAtributo[];
}

export interface CanalFrete {
  id: number;
  nome: string;
  habilitado: boolean;
}

export interface EscolhaAtributo {
  id: number;
  valorId?: number;
  texto?: string;
}

export interface EntradaCriacao {
  titulo: string;
  descricao: string;
  /** Em reais. */
  preco: number | null;
  /** Em gramas, como no cadastro do produto. */
  pesoG: number | null;
  dimensoesCm: { altura: number | null; largura: number | null; comprimento: number | null };
  categoryId: number | null;
  atributos: EscolhaAtributo[];
  /** Atributos obrigatórios da categoria (para conferir o que falta). */
  obrigatorios: { id: number; nome: string }[];
  canais: number[];
  /** Ids de imagem já enviados à Shopee, a capa primeiro. */
  imagens: string[];
  sku: string | null;
  estoque: number;
}

// ---------- Leitura das respostas (puro) ----------

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** `get_category` → lista plana com pai e se tem filhas. */
export function lerCategorias(resp: Record<string, unknown>): CategoriaShopee[] {
  const saida: CategoriaShopee[] = [];
  for (const c of lista(resp.category_list)) {
    const id = num(c.category_id);
    const nome = texto(c.display_category_name) || texto(c.original_category_name);
    if (id == null || !nome) continue;
    saida.push({ id, paiId: num(c.parent_category_id) ?? 0, nome, temFilhas: c.has_children === true });
  }
  return saida;
}

const TIPOS_LISTA = new Set(["DROP_DOWN", "COMBO_BOX"]);
const TIPOS_MULTIPLA = new Set(["MULTIPLE_SELECT", "MULTIPLE_SELECT_COMBO_BOX"]);

/** `get_attribute_tree` → atributos da primeira categoria da resposta. */
export function lerAtributos(resp: Record<string, unknown>): AtributoShopee[] {
  const lote = lista(resp.list)[0];
  const saida: AtributoShopee[] = [];
  for (const a of lista(lote?.attribute_tree ?? lote?.attribute_list)) {
    const id = num(a.attribute_id);
    const nome = texto(a.display_attribute_name) || texto(a.original_attribute_name);
    if (id == null || !nome) continue;
    const tipoBruto = texto(a.input_type, 40).toUpperCase();
    const valores = lista(a.attribute_value_list)
      .map((v) => ({ id: num(v.value_id), nome: texto(v.display_value_name) || texto(v.original_value_name) }))
      .filter((v): v is ValorAtributo => v.id != null && !!v.nome);
    const tipo = TIPOS_MULTIPLA.has(tipoBruto) ? "multipla" : TIPOS_LISTA.has(tipoBruto) && valores.length > 0 ? "lista" : texto(a.input_validation_type, 30).toUpperCase().includes("INT") || texto(a.input_validation_type, 30).toUpperCase().includes("FLOAT") ? "numero" : valores.length > 0 ? "lista" : "texto";
    saida.push({ id, nome, obrigatorio: a.is_mandatory === true, tipo, valores: valores.slice(0, 300) });
  }
  return saida;
}

/** `logistics/get_channel_list` → canais de frete. */
export function lerCanais(resp: Record<string, unknown>): CanalFrete[] {
  const saida: CanalFrete[] = [];
  for (const c of lista(resp.logistics_channel_list)) {
    const id = num(c.logistics_channel_id);
    const nome = texto(c.logistics_channel_name, 80);
    if (id == null || !nome) continue;
    saida.push({ id, nome, habilitado: c.enabled !== false });
  }
  return saida;
}

/** `media_space/upload_image` → id da imagem (aceita a forma única e a em lista). */
export function lerIdImagem(resp: Record<string, unknown>): string | null {
  const unica = resp.image_info as Record<string, unknown> | undefined;
  if (unica && typeof unica.image_id === "string" && unica.image_id) return unica.image_id;
  const primeira = lista(resp.image_info_list)[0];
  const info = primeira?.image_info as Record<string, unknown> | undefined;
  return info && typeof info.image_id === "string" && info.image_id ? info.image_id : null;
}

/** `add_item` → id do item criado. */
export function lerItemCriado(resp: Record<string, unknown>): number | null {
  return num(resp.item_id);
}

/** `get_item_base_info` → status do primeiro item. */
export function lerStatusItem(resp: Record<string, unknown>): string | null {
  const item = lista(resp.item_list)[0];
  return item && typeof item.item_status === "string" ? item.item_status.toUpperCase() : null;
}

export const estaNaoListado = (status: string | null) => status === STATUS_NAO_LISTADO;

// ---------- Conferência e corpo do add_item (puro) ----------

/** O que ainda falta para criar, em português. Vazio = pode criar. */
export function conferirEntradaCriacao(e: EntradaCriacao): string[] {
  const falta: string[] = [];
  if (e.titulo.trim().length < 3) falta.push("Escolha o título.");
  if (e.descricao.trim().length < 100) falta.push("Salve a descrição (mínimo de 100 caracteres).");
  if (!e.preco || e.preco <= 0) falta.push("O produto precisa de um preço de venda.");
  if (!e.pesoG || e.pesoG <= 0) falta.push("Preencha o peso do produto (a Shopee exige para o frete).");
  // Sem estes dois, o item nascia esgotado ou com frete calculado errado, e só se descobria no Seller Centre.
  const { altura, largura, comprimento } = e.dimensoesCm;
  if (!(altura && altura > 0 && largura && largura > 0 && comprimento && comprimento > 0)) falta.push("Preencha altura, largura e comprimento da embalagem no produto (os canais de frete calculam por elas).");
  if (!(Math.floor(e.estoque) > 0)) falta.push("O produto está sem estoque: dê entrada antes, senão o anúncio nasce esgotado.");
  if (!e.categoryId) falta.push("Escolha a categoria da Shopee.");
  const preenchidos = new Set(e.atributos.filter((a) => a.valorId != null || (a.texto ?? "").trim()).map((a) => a.id));
  for (const o of e.obrigatorios) if (!preenchidos.has(o.id)) falta.push(`Preencha o atributo obrigatório “${o.nome}”.`);
  if (e.canais.length === 0) falta.push("Marque pelo menos um canal de frete.");
  if (e.imagens.length === 0) falta.push("Aprove pelo menos uma capa (a primeira imagem do anúncio).");
  return falta;
}

/** O corpo do `add_item`. Só campos que a Shopee documenta; opcional ausente não vai. */
export function montarCorpoAddItem(e: EntradaCriacao): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    item_name: e.titulo.trim(),
    description: e.descricao.trim(),
    original_price: Math.round((e.preco ?? 0) * 100) / 100,
    weight: Math.round(((e.pesoG ?? 0) / 1000) * 1000) / 1000,
    category_id: e.categoryId,
    normal_stock: Math.max(0, Math.floor(e.estoque)),
    image: { image_id_list: e.imagens.slice(0, MAX_IMAGENS) },
    logistic_info: e.canais.map((id) => ({ logistic_id: id, enabled: true })),
    condition: "NEW",
    // Criamos SEMPRE como não listado: o usuário revisa e publica no Seller Centre.
    item_status: STATUS_NAO_LISTADO,
    // A categoria pode exigir marca; "sem marca" é o valor que a Shopee documenta.
    brand: { brand_id: 0, original_brand_name: "NoBrand" },
  };
  if (e.sku?.trim()) corpo.item_sku = e.sku.trim().slice(0, 100);
  const { altura, largura, comprimento } = e.dimensoesCm;
  if (altura && largura && comprimento) corpo.dimension = { package_height: Math.ceil(altura), package_width: Math.ceil(largura), package_length: Math.ceil(comprimento) };
  const atributos = e.atributos
    .filter((a) => a.valorId != null || (a.texto ?? "").trim())
    .map((a) => ({ attribute_id: a.id, attribute_value_list: [a.valorId != null ? { value_id: a.valorId } : { value_id: 0, original_value_name: (a.texto ?? "").trim().slice(0, 100) }] }));
  if (atributos.length) corpo.attribute_list = atributos;
  return corpo;
}

// ---------- Erros (puro) ----------

/** Mensagem da Shopee → o que o usuário entende e o que fazer. */
export function traduzirErroShopee(mensagem: string): string {
  const m = mensagem.replace(/^Shopee:\s*/i, "").trim();
  const baixa = m.toLowerCase();
  if (/error_permission|no permission|permission denied|api not allowed|scope/.test(baixa)) return "O seu app da Shopee não tem permissão para esta ação. Peça a permissão de produto (Product) no painel de desenvolvedor da Shopee Open Platform e conecte a loja de novo.";
  if (/error_auth|invalid access_token|access token|expired|invalid_acceess_token/.test(baixa)) return "A autorização da loja venceu ou é inválida. Conecte a loja de novo em Configurações.";
  if (/error_param|invalid param|wrong parameter/.test(baixa)) return `A Shopee recusou um dado do anúncio: ${m}`;
  if (/error_server|busy|timeout|rate limit|too many/.test(baixa)) return "A Shopee está ocupada ou limitou as chamadas. Espere um minuto e tente de novo.";
  return `A Shopee respondeu: ${m || "erro sem detalhe"}`;
}
