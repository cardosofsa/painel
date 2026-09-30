/**
 * Seções da vitrine montadas pela Vixe (7.9). É CONFIGURAÇÃO, não HTML: cada seção tem só
 * textos curtos, e a vitrine desenha com componentes fixos (`VitrineSecoes`).
 *
 * `normalizarSecoes` é o único portão: roda na resposta da IA, antes de gravar e ao ler do
 * banco. O que não bate com o formato some, sem erro.
 */

export interface SecoesVitrine {
  /** Faixa de abertura, acima dos produtos. */
  destaque?: { titulo: string; subtitulo: string | null };
  /** "Quem somos", abaixo dos produtos. */
  sobre?: { texto: string };
  /** Até 3 diferenciais (entrega, atendimento, qualidade...). */
  diferenciais?: { titulo: string; texto: string }[];
  /** Chamada final para falar no WhatsApp. */
  chamada?: { texto: string };
  /** Frase curta do rodapé. */
  rodape?: { texto: string };
}

export const LIMITES_SECOES = {
  destaqueTitulo: 70,
  destaqueSubtitulo: 160,
  sobre: 600,
  diferencialTitulo: 40,
  diferencialTexto: 140,
  chamada: 140,
  rodape: 120,
} as const;

/** Texto puro: sem tag, sem quebra repetida, cortado no limite. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const limpo = v
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!limpo) return null;
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd();
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function normalizarSecoes(bruto: unknown): SecoesVitrine {
  const s = objeto(bruto);
  if (!s) return {};
  const L = LIMITES_SECOES;
  const saida: SecoesVitrine = {};

  const d = objeto(s.destaque);
  const dTitulo = texto(d?.titulo, L.destaqueTitulo);
  if (dTitulo) saida.destaque = { titulo: dTitulo, subtitulo: texto(d?.subtitulo, L.destaqueSubtitulo) };

  const sobre = texto(objeto(s.sobre)?.texto, L.sobre);
  if (sobre) saida.sobre = { texto: sobre };

  const difs = (Array.isArray(s.diferenciais) ? s.diferenciais : [])
    .map((x) => {
      const o = objeto(x);
      const t = texto(o?.titulo, L.diferencialTitulo);
      const tx = texto(o?.texto, L.diferencialTexto);
      return t && tx ? { titulo: t, texto: tx } : null;
    })
    .filter((x): x is { titulo: string; texto: string } => !!x)
    .slice(0, 3);
  if (difs.length) saida.diferenciais = difs;

  const chamada = texto(objeto(s.chamada)?.texto, L.chamada);
  if (chamada) saida.chamada = { texto: chamada };

  const rodape = texto(objeto(s.rodape)?.texto, L.rodape);
  if (rodape) saida.rodape = { texto: rodape };

  return saida;
}

export function secoesVazias(s: SecoesVitrine | null | undefined): boolean {
  return !s || Object.keys(s).length === 0;
}
