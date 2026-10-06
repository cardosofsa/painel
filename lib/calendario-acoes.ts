/**
 * Calendário que age (Fase 5, onda B): cada data do comércio vira atalhos para o que
 * fazer — simular a promoção, avisar os clientes e repor o que vende. Puro, coberto por
 * `calendario-acoes.test.ts`. Os links usam os parâmetros que as telas já entendem.
 */

export interface AcaoData {
  rotulo: string;
  href: string;
}

/** Campanhas dos marketplaces (9.9, 10.10, 11.11, 12.12): o desconto é o centro. */
const CAMPANHA_MARKETPLACE = /^(9-9|10-10|11-11|12-12|black-friday|cyber-monday|consumidor)-/;
/** Datas de presente: kit e mensagem para quem já comprou valem mais que desconto. */
const DATA_PRESENTE = /^(mulher|pascoa|maes|namorados|pais|criancas|natal|cliente)-/;

/**
 * Atalhos para uma data comercial. Só aparecem quando já é hora de preparar (dentro da
 * antecedência da data) — antes disso o calendário só informa.
 */
export function acoesDaData(d: { id: string; preparar: boolean }): AcaoData[] {
  if (!d.preparar) return [];
  const promo = { rotulo: "Simular promoção", href: "/precificacao?visao=promocao" };
  const avisar = { rotulo: "Avisar clientes", href: "/vixe/mensagens?filtro=data" };
  const repor = { rotulo: "Repor o que vende", href: "/compras" };
  const kit = { rotulo: "Montar kit", href: "/precificacao?visao=kits" };
  if (CAMPANHA_MARKETPLACE.test(d.id)) return [promo, repor, avisar];
  if (DATA_PRESENTE.test(d.id)) return [avisar, kit, repor];
  return [repor, avisar];
}
