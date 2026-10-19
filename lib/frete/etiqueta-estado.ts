/**
 * Estado da compra da etiqueta, guardado em `vendas.frete_etiqueta_id`. Puro, coberto por
 * `etiqueta-estado.test.ts`.
 *
 * Antes a coluna só recebia o id no FIM da compra: dois cliques compravam duas etiquetas, e uma
 * falha depois de pagar (gerar, imprimir, gravar) deixava a venda "sem etiqueta" e a próxima
 * tentativa pagava de novo. Agora a compra marca a venda antes de cada passo:
 *
 *   null                  sem etiqueta
 *   "reservando:<iso>"    compra começou, o carrinho ainda não existe (nada foi cobrado)
 *   "pendente:<id>"       carrinho criado (talvez já pago): a próxima tentativa RETOMA este
 *   "<id>"                comprada
 */

export type EstadoEtiqueta = { tipo: "nenhuma" } | { tipo: "reservando"; desde: Date } | { tipo: "pendente"; id: string } | { tipo: "comprada"; id: string };

/** Reserva mais velha que isso foi abandonada (a compra caiu antes de criar o carrinho). */
export const RESERVA_EXPIRA_MS = 5 * 60 * 1000;

export function estadoEtiqueta(valor: string | null | undefined): EstadoEtiqueta {
  const v = (valor ?? "").trim();
  if (!v) return { tipo: "nenhuma" };
  if (v.startsWith("reservando:")) {
    const desde = new Date(v.slice("reservando:".length));
    return { tipo: "reservando", desde: Number.isNaN(desde.getTime()) ? new Date(0) : desde };
  }
  if (v.startsWith("pendente:")) return { tipo: "pendente", id: v.slice("pendente:".length) };
  return { tipo: "comprada", id: v };
}

export const marcaReserva = (agora: Date) => `reservando:${agora.toISOString()}`;
export const marcaPendente = (id: string) => `pendente:${id}`;

/** Pode começar uma compra nova? (Sem etiqueta, ou reserva abandonada.) */
export function podeReservar(e: EstadoEtiqueta, agora: Date): boolean {
  return e.tipo === "nenhuma" || (e.tipo === "reservando" && agora.getTime() - e.desde.getTime() > RESERVA_EXPIRA_MS);
}
