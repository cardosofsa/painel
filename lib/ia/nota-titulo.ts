/**
 * Nota local de um título de anúncio, sem IA: regras objetivas que qualquer marketplace
 * premia na busca. Serve para a pessoa comparar as opções geradas num relance.
 *
 * Função pura — roda no navegador a cada tecla, não custa nada.
 */

export interface CriterioTitulo {
  ok: boolean;
  texto: string;
}

export interface NotaTitulo {
  /** 0 a 100, em passos de 25 (quatro critérios de mesmo peso). */
  nota: number;
  criterios: CriterioTitulo[];
}

/** Palavras que não contam como repetição nem como "termo principal". */
const VAZIAS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "sem", "um", "uma", "no", "na"]);

function normalizar(palavra: string): string {
  return palavra
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function palavrasSignificativas(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map(normalizar)
    .filter((p) => p.length > 1 && !VAZIAS.has(p));
}

/**
 * @param termoPrincipal o que o comprador digitaria na busca — a 1ª palavra-chave da IA
 *   ou, sem ela, o nome do produto. Só a primeira palavra significativa dele é exigida
 *   no começo do título.
 */
export function avaliarTitulo(titulo: string, { limite, termoPrincipal }: { limite: number; termoPrincipal?: string | null }): NotaTitulo {
  const texto = titulo.trim();
  const tamanho = texto.length;
  const minimo = Math.floor(limite * 0.6);

  const palavras = palavrasSignificativas(texto);
  const repetidas = [...new Set(palavras.filter((p, i) => palavras.indexOf(p) !== i))];

  const alvo = termoPrincipal ? palavrasSignificativas(termoPrincipal)[0] : undefined;
  // "No começo" = entre as três primeiras palavras significativas.
  const termoNoComeco = alvo ? palavras.slice(0, 3).includes(alvo) : true;

  const criterios: CriterioTitulo[] = [
    { ok: tamanho > 0 && tamanho <= limite, texto: tamanho <= limite ? `Cabe no limite (${tamanho}/${limite})` : `Passa do limite (${tamanho}/${limite})` },
    { ok: tamanho >= minimo, texto: tamanho >= minimo ? "Aproveita o espaço" : `Curto: use pelo menos ${minimo} caracteres` },
    { ok: termoNoComeco, texto: termoNoComeco ? "Termo principal no começo" : "Termo principal longe do começo" },
    {
      ok: repetidas.length === 0,
      texto: repetidas.length === 0 ? "Sem palavra repetida" : `Palavra repetida: ${repetidas.slice(0, 3).join(", ")}`,
    },
  ];

  return { nota: criterios.filter((c) => c.ok).length * 25, criterios };
}
