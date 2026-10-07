/**
 * Taxas reais da Shopee e repasse que só vence depois de concluído (0085), num Postgres de
 * verdade (PGlite) com todas as migrações. Rode com `npm run test:sql`.
 */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('rep@r.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

const prod = (await um(`insert into produtos (user_id, sku, nome, custo, preco_venda, estoque) values ($1, 'FITA-BIKE-UN', 'Fita', 6, 27.49, 10) returning id`, [u])).id;
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso e-Shop') returning id`, [u, canal])).id;
const estoque = async () => Number((await um(`select estoque from produtos where id = $1`, [prod])).estoque);

// Pedido 2610082QFT1WTB: venda 27,49; taxas reais 10,54 (5,11 + 4,88 + recarga 0,55); renda 16,95.
const REAL = { taxas_origem: "real", comissao: 5.11, taxa_servico: 4.88, taxa_transacao: 0, taxa_outras: 0.55, repasse: 16.95, lucro: 7.65,
  taxas_detalhe: [{ rotulo: "Comissão", valor: 5.11 }, { rotulo: "Taxa de serviço", valor: 4.88 }, { rotulo: "Taxa da recarga automática", valor: 0.55 }] };
const ESTIMADO = { taxas_origem: "estimado", comissao: 5.5, taxa_servico: 4.5, taxa_transacao: 0, taxa_outras: 0, repasse: 17.49, lucro: 8.19,
  taxas_detalhe: [{ rotulo: "Comissão (estimada)", valor: 5.5 }] };
const pedido = (numero, status, original, taxas, extra = {}) => ({
  numero, status, status_original: original, criado_em: "2026-09-01T12:00:00Z", pago_em: "2026-09-01T12:05:00Z",
  comprador: "x", cidade: null, uf: "CE", rastreio: null, subtotal: 27.49, desconto_vendedor: 0, cupom_vendedor: 0,
  frete_comprador: 0, custo: 6, imposto: 3.3, custo_incompleto: false,
  itens: [{ produto_id: prod, sku: "FITA-BIKE-UN", sku_principal: null, nome: "Fita", variacao: null, quantidade: 1, preco_unitario: 27.49, custo_unitario: 6 }],
  ...taxas, ...extra,
});
const importar = (lista) => um(`select importar_pedidos_marketplace($1, $2::jsonb) as r`, [loja, JSON.stringify(lista)]);
const ped = (n) => um(`select * from pedidos_marketplace where numero = $1`, [n]);
const contaDo = async (n) => {
  const p = await ped(n);
  return p.conta_receber_id ? um(`select * from contas_a_pagar_receber where id = $1`, [p.conta_receber_id]) : null;
};

// 1) Enviado, com taxa real: grava o detalhamento; o repasse AGUARDA (não vence).
await importar([pedido("2610082QFT1WTB", "enviado", "SHIPPED", REAL)]);
let p = await ped("2610082QFT1WTB");
confere("grava as taxas reais e a origem", p.taxas_origem === "real" && Number(p.taxa_outras) === 0.55 && Number(p.repasse) === 16.95 && p.taxas_detalhe.length === 3, JSON.stringify({ o: p.taxas_origem, outras: p.taxa_outras }));
let c = await contaDo("2610082QFT1WTB");
confere("repasse de pedido enviado fica aguardando liberação", c && c.aguardando_liberacao === true && c.status === "pendente" && Number(c.valor) === 16.95);

// 2) Escrow falhou desta vez (estimado): a taxa real não é trocada pela estimativa.
await importar([pedido("2610082QFT1WTB", "enviado", "SHIPPED", ESTIMADO)]);
p = await ped("2610082QFT1WTB");
confere("estimativa não sobrescreve taxa real", p.taxas_origem === "real" && Number(p.comissao) === 5.11 && Number(p.repasse) === 16.95 && Number(p.lucro) === 7.65, JSON.stringify({ o: p.taxas_origem, c: p.comissao, r: p.repasse, l: p.lucro }));

// 3) Concluído e liberado: vence na data de liberação, sai de "aguardando".
await importar([pedido("2610082QFT1WTB", "concluido", "COMPLETED", REAL, { escrow_liberado_em: "2026-09-20T15:00:00Z" })]);
c = await contaDo("2610082QFT1WTB");
p = await ped("2610082QFT1WTB");
confere("liberado: vencimento = liberação, não aguarda mais", c.aguardando_liberacao === false && new Date(c.data_vencimento).toISOString().startsWith("2026-09-20"), String(c.data_vencimento));
confere("guarda a liberação no pedido", p.escrow_liberado_em !== null);

// 4) Cancelado: o repasse pendente sai.
await importar([pedido("CANC1", "a_enviar", "READY_TO_SHIP", ESTIMADO)]);
confere("pedido a enviar: repasse aguardando", (await contaDo("CANC1")).aguardando_liberacao === true);
const idContaCanc = (await ped("CANC1")).conta_receber_id;
await importar([pedido("CANC1", "cancelado", "CANCELLED", { ...ESTIMADO, repasse: 0 })]);
confere("cancelado remove o repasse pendente", (await ped("CANC1")).conta_receber_id === null && !(await um(`select 1 as x from contas_a_pagar_receber where id = $1`, [idContaCanc])));

// 5) Devolvido: estoque NÃO volta sozinho; repasse vai ao valor final; pedido a revisar.
const antes = await estoque();
await importar([pedido("DEV1", "concluido", "COMPLETED", REAL)]);
confere("concluído baixa 1", (await estoque()) === antes - 1);
await importar([pedido("DEV1", "devolvido", "TO_RETURN", { ...REAL, repasse: 5 })]);
p = await ped("DEV1");
c = await contaDo("DEV1");
confere("devolvido não devolve o estoque sem saber se o item voltou", (await estoque()) === antes - 1 && p.estoque_baixado === true, String(await estoque()));
confere("devolvido: repasse com o valor final, aguardando revisão", c && Number(c.valor) === 5 && c.aguardando_liberacao === true && p.devolucao_revisar === true);
await importar([pedido("DEV1", "devolvido", "TO_RETURN", { ...REAL, repasse: 0 })]);
confere("devolvido com repasse zero: o pendente sai", (await ped("DEV1")).conta_receber_id === null);

// 6) Repasse já recebido à mão não é tocado.
await importar([pedido("REC1", "enviado", "SHIPPED", REAL)]);
c = await contaDo("REC1");
await q(`update contas_a_pagar_receber set status = 'recebido', valor_pago = 16.95, data_pagamento = '2026-09-10', aguardando_liberacao = false where id = $1`, [c.id]);
await importar([pedido("REC1", "cancelado", "CANCELLED", { ...REAL, repasse: 0 })]);
c = await um(`select * from contas_a_pagar_receber where id = $1`, [c.id]);
confere("recebido à mão continua recebido", c && c.status === "recebido" && Number(c.valor_pago) === 16.95);

// 7) Correção dos dados antigos (reaplicar a 0085): pendente de pedido enviado volta a aguardar,
//    cancelado perde o pendente, recebido fica.
const antigo = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido OLD1', 10, '2026-09-01') returning id`, [u])).id;
await q(`insert into pedidos_marketplace (user_id, loja_id, numero, status, subtotal, repasse, conta_receber_id) values ($1, $2, 'OLD1', 'enviado', 12, 10, $3)`, [u, loja, antigo]);
const antigoC = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido OLD2', 10, '2026-09-01') returning id`, [u])).id;
await q(`insert into pedidos_marketplace (user_id, loja_id, numero, status, subtotal, repasse, conta_receber_id) values ($1, $2, 'OLD2', 'cancelado', 12, 0, $3)`, [u, loja, antigoC]);
await db.exec(await lerMigracao("0085_shopee_taxas_repasses.sql"));
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
confere("dados antigos: enviado passa a aguardar", (await um(`select aguardando_liberacao from contas_a_pagar_receber where id = $1`, [antigo])).aguardando_liberacao === true);
confere("dados antigos: cancelado perde o pendente", !(await um(`select 1 as x from contas_a_pagar_receber where id = $1`, [antigoC])));
confere("dados antigos: recebido intacto", (await um(`select status from contas_a_pagar_receber where id = $1`, [c.id])).status === "recebido");

// 8) DRE soma a taxa_outras.
const dre = await um(`select taxas_marketplace from dre_mensal('2026-09-01', '2026-09-30')`);
const esperado = Number((await um(`select sum(comissao + taxa_servico + taxa_transacao + taxa_outras) s from pedidos_marketplace where status not in ('cancelado','devolvido','nao_pago')`)).s);
confere("DRE inclui a recarga automática nas taxas", Number(dre.taxas_marketplace) === Math.round(esperado * 100) / 100, `${dre.taxas_marketplace} vs ${esperado}`);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
