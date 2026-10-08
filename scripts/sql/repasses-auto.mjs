/**
 * Repasse de marketplace que nunca "atrasa" e é recebido sozinho (0087), num Postgres de
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
const comoUsuario = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);

const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
  return id;
};
const u = await novoUsuario("auto@r.com");
const outro = await novoUsuario("outro@r.com");
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
await comoUsuario(u);

const prod = (await um(`insert into produtos (user_id, sku, nome, custo, preco_venda, estoque) values ($1, 'FITA', 'Fita', 6, 27.49, 50) returning id`, [u])).id;
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso e-Shop') returning id`, [u, canal])).id;

const REAL = { taxas_origem: "real", comissao: 5.11, taxa_servico: 4.88, taxa_transacao: 0, taxa_outras: 0.55, repasse: 16.95, lucro: 7.65, taxas_detalhe: [] };
const pedido = (numero, status, original, extra = {}) => ({
  numero, status, status_original: original, criado_em: "2026-09-01T12:00:00Z", pago_em: "2026-09-01T12:05:00Z",
  comprador: "x", cidade: null, uf: "CE", rastreio: null, subtotal: 27.49, desconto_vendedor: 0, cupom_vendedor: 0,
  frete_comprador: 0, custo: 6, imposto: 3.3, custo_incompleto: false,
  itens: [{ produto_id: prod, sku: "FITA", sku_principal: null, nome: "Fita", variacao: null, quantidade: 1, preco_unitario: 27.49, custo_unitario: 6 }],
  ...REAL, ...extra,
});
const importar = (lista) => um(`select importar_pedidos_marketplace($1, $2::jsonb) as r`, [loja, JSON.stringify(lista)]);
const ped = (n) => um(`select * from pedidos_marketplace where numero = $1`, [n]);
const contaDo = async (n) => {
  const p = await ped(n);
  return p.conta_receber_id ? um(`select * from contas_a_pagar_receber where id = $1`, [p.conta_receber_id]) : null;
};
const contaLoja = async () => um(`select c.* from contas c join lojas_canal l on l.conta_financeira_id = c.id where l.id = $1`, [loja]);
const movs = (n) => q(`select * from movimentacoes_financeiras where descricao like '%pedido ' || $1 order by criado_em, valor desc`, [n]);
const LIBERADO = { escrow_liberado_em: "2026-09-20T15:00:00Z" };

// 1) Não concluído: repasse referenciado ao pedido, aguardando, sem conta da loja ainda.
await importar([pedido("A1", "enviado", "SHIPPED")]);
let c = await contaDo("A1");
const pA1 = await ped("A1");
confere("repasse grava a referência ao pedido", c && c.referencia_pedido_marketplace_id === pA1.id && c.aguardando_liberacao === true && c.status === "pendente");
confere("não concluído não cria conta nem lança nada", !(await contaLoja()) && (await movs("A1")).length === 0);

// 2) Concluído sem liberação: continua pendente (sem baixa) — e não é alerta (referência).
await importar([pedido("A1", "concluido", "COMPLETED")]);
c = await contaDo("A1");
confere("concluído sem escrow liberado: pendente, sem entrada", c.status === "pendente" && (await movs("A1")).length === 0);

// 3) Concluído e liberado: recebido com o valor real, conta "Shopee — <loja>" criada, uma vez só.
await importar([pedido("A1", "concluido", "COMPLETED", LIBERADO)]);
await importar([pedido("A1", "concluido", "COMPLETED", LIBERADO)]);
c = await contaDo("A1");
const cl = await contaLoja();
let m = await movs("A1");
confere("conta financeira da loja criada automaticamente", cl && cl.nome === "Shopee — Cardoso e-Shop", cl?.nome);
confere("repasse recebido com o valor real na conta da loja", c.status === "recebido" && Number(c.valor_pago) === 16.95 && c.conta_id === cl.id && String(c.data_pagamento).length > 0);
confere("sync 2x: uma entrada só", m.length === 1 && m[0].tipo === "entrada" && Number(m[0].valor) === 16.95 && m[0].conta_id === cl.id, String(m.length));
confere("saldo da conta = repasse", Number(cl.saldo) === 16.95, String(cl.saldo));
let p = await ped("A1");
confere("pedido marca o recebido (conciliado)", Number(p.repasse_recebido) === 16.95 && p.repasse_conta_id === cl.id);

// 4) Segundo pedido reaproveita a conta da loja (não cria outra).
await importar([pedido("A2", "concluido", "COMPLETED", LIBERADO)]);
confere("segunda baixa usa a mesma conta", Number((await um(`select count(*) n from contas where user_id = $1`, [u])).n) === 1 && Number((await contaLoja()).saldo) === 33.9);

// 5) Estornado depois de recebido: saída da diferença na mesma conta, uma vez só.
await importar([pedido("A2", "devolvido", "TO_RETURN", { ...LIBERADO, repasse: 5 })]);
await importar([pedido("A2", "devolvido", "TO_RETURN", { ...LIBERADO, repasse: 5 })]);
m = await movs("A2");
confere("reembolso parcial: saída de 11,95 uma vez", m.length === 2 && m.filter((x) => x.tipo === "saida").length === 1 && Number(m.find((x) => x.tipo === "saida").valor) === -11.95, JSON.stringify(m.map((x) => [x.tipo, x.valor])));
await importar([pedido("A2", "cancelado", "CANCELLED", { repasse: 0 })]);
m = await movs("A2");
confere("cancelado depois: saída do resto, saldo volta", m.filter((x) => x.tipo === "saida").length === 2 && Number((await contaLoja()).saldo) === 16.95, String((await contaLoja()).saldo));
confere("pedido estornado fica com recebido 0", Number((await ped("A2")).repasse_recebido) === 0);

// 6) Cancelado antes de concluir: repasse pendente sai, nada lançado.
await importar([pedido("C1", "a_enviar", "READY_TO_SHIP")]);
await importar([pedido("C1", "cancelado", "CANCELLED", { repasse: 0 })]);
confere("cancelado sem baixa: sem repasse e sem movimento", (await ped("C1")).conta_receber_id === null && (await movs("C1")).length === 0);

// 7) Recebido à mão: a baixa automática não toca.
await importar([pedido("M1", "enviado", "SHIPPED")]);
c = await contaDo("M1");
await q(`update contas_a_pagar_receber set status = 'recebido', valor_pago = 16.95, data_pagamento = '2026-09-10' where id = $1`, [c.id]);
await importar([pedido("M1", "concluido", "COMPLETED", LIBERADO)]);
confere("recebido à mão não ganha entrada automática", (await movs("M1")).length === 0 && (await ped("M1")).repasse_recebido === null);

// 8) Dados antigos: concluído com escrow, pendente → recebido ao reaplicar a 0087 (2x, sem duplicar);
//    conta sem vínculo achada pela descrição; repasse órfão não vence.
const velha = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido OLD1', 10, '2026-09-01') returning id`, [u])).id;
await q(`insert into pedidos_marketplace (user_id, loja_id, numero, status, subtotal, repasse, escrow_liberado_em) values ($1, $2, 'OLD1', 'concluido', 12, 10, '2026-09-15T10:00:00Z')`, [u, loja]);
const orfa = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido SUMIU', 10, '2026-08-01') returning id`, [u])).id;
const comum = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Venda fiado Maria', 10, '2026-08-01') returning id`, [u])).id;
await db.exec(await lerMigracao("0087_repasses_marketplace_automaticos.sql"));
await db.exec(await lerMigracao("0087_repasses_marketplace_automaticos.sql"));
await comoUsuario(u);
c = await um(`select * from contas_a_pagar_receber where id = $1`, [velha]);
confere("dados antigos: referência pela descrição + loja", c.referencia_pedido_marketplace_id === (await ped("OLD1")).id);
confere("dados antigos: concluído com escrow vira recebido", c.status === "recebido" && Number(c.valor_pago) === 10);
confere("dados antigos: reaplicar não duplica a entrada", (await movs("OLD1")).length === 1);
confere("repasse órfão fica aguardando (não vence)", (await um(`select aguardando_liberacao a from contas_a_pagar_receber where id = $1`, [orfa])).a === true);
confere("conta comum não é tocada", (await um(`select aguardando_liberacao a, referencia_pedido_marketplace_id r from contas_a_pagar_receber where id = $1`, [comum])).a === false);

// 9) Nenhum repasse pendente "vencível": todo pendente de repasse tem referência ou aguarda.
const vencivel = await um(`select count(*) n from contas_a_pagar_receber where status = 'pendente' and descricao like 'Repasse %' and referencia_pedido_marketplace_id is null and not aguardando_liberacao`);
confere("nenhum repasse pendente fica vencível", Number(vencivel.n) === 0);

// 10) Segurança: funções internas fechadas; RLS isola a conta criada.
const pode = async (f) => (await um(`select has_function_privilege('authenticated', $1, 'execute') ok`, [f])).ok;
confere("liquidar_repasse_marketplace sem EXECUTE para authenticated/anon",
  !(await pode("liquidar_repasse_marketplace(uuid, uuid)")) && !(await um(`select has_function_privilege('anon', 'liquidar_repasse_marketplace(uuid, uuid)', 'execute') ok`)).ok);
confere("conta_financeira_da_loja sem EXECUTE para authenticated", !(await pode("conta_financeira_da_loja(uuid, uuid)")));
await db.exec(`set role authenticated`);
await comoUsuario(outro);
const vistas = await q(`select id from contas where nome like 'Shopee —%'`);
const vistasCpr = await q(`select id from contas_a_pagar_receber where referencia_pedido_marketplace_id is not null`);
let negou = false;
try {
  await q(`select liquidar_repasse_marketplace($1, $2)`, [u, (await um(`select id from pedidos_marketplace limit 1`))?.id ?? "00000000-0000-0000-0000-000000000000"]);
} catch {
  negou = true;
}
await db.exec(`reset role`);
confere("outra conta não vê a carteira nem os repasses", vistas.length === 0 && vistasCpr.length === 0);
confere("outra conta não chama a baixa", negou);
await comoUsuario(outro);
let negouFk = false;
const contaOutro = (await um(`insert into contas (user_id, nome) values ($1, 'X') returning id`, [outro])).id;
await comoUsuario(u);
await db.exec(`set role authenticated`);
try {
  await q(`update lojas_canal set conta_financeira_id = $1 where id = $2`, [contaOutro, loja]);
} catch {
  negouFk = true;
}
await db.exec(`reset role`);
confere("loja não aponta para conta de outro usuário", negouFk);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
