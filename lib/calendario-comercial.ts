/**
 * Calendário comercial do Brasil (11.6): as datas que mais vendem, com o que preparar.
 * Puro, coberto por `calendario-comercial.test.ts`. Datas móveis são calculadas por ano
 * (Páscoa, Carnaval, Dia das Mães/Pais, Black Friday).
 */

export interface DataComercial {
  id: string;
  nome: string;
  /** yyyy-mm-dd */
  data: string;
  dica: string;
  /** Quantos dias antes vale começar a preparar. */
  antecedencia: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dia = (ano: number, mes: number, d: number) => new Date(ano, mes - 1, d);

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaMes = ((h + l - 7 * m + 114) % 31) + 1;
  return dia(ano, mes, diaMes);
}

/** n-ésimo dia da semana (0 = domingo) do mês. */
function enesimo(ano: number, mes: number, semana: number, n: number): Date {
  const d = dia(ano, mes, 1);
  const delta = (semana - d.getDay() + 7) % 7;
  return dia(ano, mes, 1 + delta + (n - 1) * 7);
}

const somar = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function datasDoAno(ano: number): DataComercial[] {
  const p = pascoa(ano);
  const blackFriday = somar(enesimo(ano, 11, 4, 4), 1);
  const lista: [string, string, Date, string, number][] = [
    ["volta-aulas", "Volta às aulas", dia(ano, 1, 25), "Kits de material e mochilas; estoque antes do fim de janeiro.", 30],
    ["carnaval", "Carnaval", somar(p, -47), "Fantasias, acessórios e itens de festa; envio rápido conta muito.", 25],
    ["mulher", "Dia da Mulher", dia(ano, 3, 8), "Presentes e kits femininos; cupom na vitrine.", 15],
    ["consumidor", "Dia do Consumidor", dia(ano, 3, 15), "Semana de descontos nos marketplaces; revise a margem no Radar.", 15],
    ["pascoa", "Páscoa", p, "Kits presenteáveis e embalagem temática.", 25],
    ["maes", "Dia das Mães", enesimo(ano, 5, 0, 2), "A 2ª maior data do varejo: kits de presente e estoque reforçado.", 35],
    ["namorados", "Dia dos Namorados", dia(ano, 6, 12), "Kits para casal e embalagem de presente.", 25],
    ["pais", "Dia dos Pais", enesimo(ano, 8, 0, 2), "Kits masculinos e frete garantido até a data.", 30],
    ["9-9", "9.9 (Shopee/ML)", dia(ano, 9, 9), "Campanha dos marketplaces: inscreva os anúncios e confira as taxas.", 20],
    ["cliente", "Dia do Cliente", dia(ano, 9, 15), "Mensagem para quem já comprou + cupom de retorno.", 10],
    ["10-10", "10.10 (Shopee/ML)", dia(ano, 10, 10), "Campanha dos marketplaces; revise preço e estoque dos campeões.", 20],
    ["criancas", "Dia das Crianças", dia(ano, 10, 12), "Brinquedos e kits infantis; atenção ao prazo de envio.", 30],
    ["11-11", "11.11 (Shopee/ML)", dia(ano, 11, 11), "Maior campanha dos marketplaces antes da Black Friday.", 25],
    ["black-friday", "Black Friday", blackFriday, "Maior data do ano: estoque, kits e preço com margem conferida no Radar.", 45],
    ["cyber-monday", "Cyber Monday", somar(blackFriday, 3), "Segunda chance da Black Friday para o online.", 10],
    ["12-12", "12.12 (Shopee/ML)", dia(ano, 12, 12), "Última campanha antes do Natal; prazo de envio é tudo.", 20],
    ["natal", "Natal", dia(ano, 12, 25), "Kits de presente, embalagem e data-limite de envio clara.", 40],
  ];
  return lista.map(([id, nome, d, dica, antecedencia]) => ({ id: `${id}-${ano}`, nome, data: iso(d), dica, antecedencia }));
}

/** Próximas datas a partir de hoje (inclusive), dentro de `janela` dias. */
export function proximasDatas(hoje: Date, janela = 60): (DataComercial & { faltam: number; preparar: boolean })[] {
  const h = dia(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate());
  return [...datasDoAno(h.getFullYear()), ...datasDoAno(h.getFullYear() + 1)]
    .map((d) => {
      const [a, m, x] = d.data.split("-").map(Number);
      const faltam = Math.round((dia(a, m, x).getTime() - h.getTime()) / 86_400_000);
      return { ...d, faltam, preparar: faltam <= d.antecedencia };
    })
    .filter((d) => d.faltam >= 0 && d.faltam <= janela)
    .sort((a, b) => a.faltam - b.faltam);
}
