/**
 * Análise completa de um anúncio, SEM IA: título, imagens, vendas, estoque e preço. Puro,
 * coberto por `analise-anuncio.test.ts`. A IA (lib/ia/prompts-analise-anuncio.ts) só narra e
 * prioriza estes números; nada aqui depende dela.
 */
import { avaliarTitulo, type CriterioTitulo } from "./ia/nota-titulo";
import { regrasAtivas, verificarTextos, type Violacao } from "./conformidade/termos";
import { LIMIARES } from "./consultor/insights";
import type { Tendencia } from "./demanda";

export type VereditoAnalise = "replicar" | "atencao" | "nao_vale" | "parado" | "ainda_cedo" | "ok";

export const ROTULO_VEREDITO: Record<VereditoAnalise, string> = {
  replicar: "Vale replicar",
  atencao: "Pede atenção",
  nao_vale: "Não vale a pena assim",
  parado: "Parado",
  ainda_cedo: "Ainda cedo para dizer",
  ok: "Dentro do esperado",
};

export interface EntradaAnalise {
  titulo: string;
  limiteTitulo: number;
  /** Palavras-chave do produto (cadastro). */
  palavrasChave: string[];
  termoPrincipal: string | null;
  termosProibidos: string[];
  /** Imagens: a capa sincronizada e, quando lida da Shopee, o total. */
  capa: string | null;
  totalImagens: number | null;
  maxImagens: number;
  vendas: { d30: { unidades: number; pedidos: number; receita: number }; d90: { unidades: number; pedidos: number } } | null;
  tendencia: Tendencia;
  estoque: number;
  vendaPorDia: number;
  /** Do Ajuste de Preço; `null` sem loja ou sem custo. */
  preco: { atual: number | null; ideal: number | null; minimo: number | null; lucro: number | null; margem: number | null; zonaMorta: boolean } | null;
}

export interface PontoAnalise {
  tipo: "forte" | "fraco";
  aba: "titulo" | "imagens" | "preco" | "estrategia";
  texto: string;
}

export interface Analise {
  titulo: { nota: number; criterios: CriterioTitulo[]; caracteres: number; limite: number; violacoes: Violacao[]; presentes: string[]; ausentes: string[] };
  imagens: { total: number | null; temCapa: boolean; recomendado: number; faltam: number | null };
  vendas: { veredito: VereditoAnalise; motivo: string };
  estoque: { dias: number | null; ruptura: boolean };
  pontos: PontoAnalise[];
  /** 0–100: média simples de título, imagens, preço e vendas (cada parte só entra se medida). */
  nota: number;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Ruptura: estoque para menos de 14 dias de venda (o mesmo limite de `lib/alertas.ts`). */
const DIAS_RUPTURA = 14;
/** Imagens recomendadas: o máximo da plataforma, até 8 (a Shopee aceita 9; 8 já cobre o essencial). */
const IMAGENS_BOAS = 8;

export function analisarAnuncio(e: EntradaAnalise): Analise {
  const titulo = e.titulo.trim();
  const nota = avaliarTitulo(titulo, { limite: e.limiteTitulo, termoPrincipal: e.termoPrincipal });
  const violacoes = verificarTextos([{ campo: "Título", texto: titulo, tipo: "texto" }], regrasAtivas([], e.termosProibidos));
  const tituloNorm = normalizar(titulo);
  const chaves = [...new Set(e.palavrasChave.map((p) => p.trim()).filter(Boolean))];
  const presentes = chaves.filter((p) => tituloNorm.includes(normalizar(p)));
  const ausentes = chaves.filter((p) => !tituloNorm.includes(normalizar(p)));

  const recomendado = Math.min(e.maxImagens, IMAGENS_BOAS);
  const imagens = { total: e.totalImagens, temCapa: !!e.capa, recomendado, faltam: e.totalImagens === null ? null : Math.max(0, recomendado - e.totalImagens) };

  const dias = e.vendaPorDia > 0 ? Math.round(e.estoque / e.vendaPorDia) : null;
  const estoque = { dias, ruptura: dias !== null && dias < DIAS_RUPTURA };

  // Veredito pelos mesmos limiares do Consultor (Vendas › Insights).
  let vendas: Analise["vendas"];
  const margem = e.preco?.margem ?? null;
  if (!e.vendas) vendas = { veredito: "ainda_cedo", motivo: "Sem as vendas por anúncio (migração 0102)." };
  else if (e.vendas.d90.unidades === 0) vendas = { veredito: "parado", motivo: "Nenhuma venda em 90 dias." };
  else if (e.vendas.d30.pedidos < LIMIARES.amostraMinima) vendas = { veredito: "ainda_cedo", motivo: `Só ${e.vendas.d30.pedidos} pedido(s) em 30 dias: pouco para concluir.` };
  else if (margem !== null && margem < LIMIARES.margemFraca) vendas = { veredito: "nao_vale", motivo: `Vende, mas a margem está em ${Math.round(margem * 100)}%.` };
  else if (e.tendencia === "caindo") vendas = { veredito: "atencao", motivo: "As vendas estão caindo nas últimas semanas." };
  else if (margem !== null && margem >= LIMIARES.margemBoa && e.vendas.d30.pedidos >= LIMIARES.amostraSolida) vendas = { veredito: "replicar", motivo: `${e.vendas.d30.pedidos} pedidos em 30 dias com ${Math.round(margem * 100)}% de margem.` };
  else vendas = { veredito: "ok", motivo: `${e.vendas.d30.pedidos} pedidos em 30 dias.` };

  const pontos: PontoAnalise[] = [];
  const add = (tipo: PontoAnalise["tipo"], aba: PontoAnalise["aba"], texto: string) => pontos.push({ tipo, aba, texto });
  if (nota.nota >= 75) add("forte", "titulo", `Título com nota ${nota.nota}/100.`);
  else add("fraco", "titulo", `Título com nota ${nota.nota}/100: ${nota.criterios.filter((c) => !c.ok).map((c) => c.texto.toLowerCase()).join("; ")}.`);
  const bloqueio = violacoes.find((v) => v.gravidade === "bloquear");
  if (bloqueio) add("fraco", "titulo", `O título tem termo que as plataformas costumam barrar: “${bloqueio.trecho}”.`);
  else if (violacoes.length) add("fraco", "titulo", `Revise no título: “${violacoes[0].trecho}” (${violacoes[0].motivo.toLowerCase()}).`);
  if (ausentes.length) add("fraco", "titulo", `Palavras-chave fora do título: ${ausentes.slice(0, 4).join(", ")}.`);
  if (!imagens.temCapa) add("fraco", "imagens", "Sem capa sincronizada.");
  if (imagens.faltam) add("fraco", "imagens", `${imagens.total} imagem(ns): o recomendado é ${recomendado}.`);
  else if (imagens.total !== null) add("forte", "imagens", `${imagens.total} imagens.`);
  if (e.preco?.lucro !== null && e.preco?.lucro !== undefined && e.preco.lucro < 0) add("fraco", "preco", "Cada venda dá prejuízo no preço atual.");
  else if (e.preco?.zonaMorta) add("fraco", "preco", "O preço está na zona morta da comissão.");
  else if (e.preco?.atual && e.preco.ideal && e.preco.atual < e.preco.ideal - 0.01) add("fraco", "preco", "Preço abaixo do ideal da sua margem.");
  else if (e.preco?.atual) add("forte", "preco", "Preço dentro da sua regra.");
  if (vendas.veredito === "replicar") add("forte", "estrategia", vendas.motivo);
  if (vendas.veredito === "atencao" || vendas.veredito === "nao_vale" || vendas.veredito === "parado") add("fraco", "estrategia", vendas.motivo);
  if (estoque.ruptura) add("fraco", "estrategia", `Estoque para cerca de ${dias} dias: repor antes de faltar.`);

  // Nota geral: cada parte de 0 a 100, média só do que foi medido.
  const partes: number[] = [nota.nota - (violacoes.some((v) => v.gravidade === "bloquear") ? 25 : 0)];
  if (imagens.total !== null) partes.push(Math.round((Math.min(imagens.total, recomendado) / recomendado) * 100));
  else partes.push(imagens.temCapa ? 60 : 0);
  if (e.preco?.atual) partes.push(e.preco.lucro !== null && e.preco.lucro < 0 ? 0 : e.preco.zonaMorta ? 40 : e.preco.ideal && e.preco.atual < e.preco.ideal - 0.01 ? 60 : 100);
  const pesoVenda: Partial<Record<VereditoAnalise, number>> = { replicar: 100, ok: 75, atencao: 45, nao_vale: 25, parado: 0 };
  if (pesoVenda[vendas.veredito] !== undefined) partes.push(pesoVenda[vendas.veredito]!);

  return {
    titulo: { nota: nota.nota, criterios: nota.criterios, caracteres: titulo.length, limite: e.limiteTitulo, violacoes, presentes, ausentes },
    imagens,
    vendas,
    estoque,
    pontos,
    nota: Math.max(0, Math.min(100, Math.round(partes.reduce((s, x) => s + x, 0) / partes.length))),
  };
}
