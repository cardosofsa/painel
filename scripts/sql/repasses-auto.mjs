/**
 * Repasse de marketplace que nunca "atrasa" e não mexe no financeiro (0087), num Postgres de
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
const contasDe = async (id) => Number((await um(`select count(*) n from contas where user_id = $1`, [id])).n);
const movs = (n) => q(`select * from movimentacoes_financeiras where descricao like '%pedido ' || $1 order by criado_em, valor desc`, [n]);
const LIBERADO = { escrow_liberado_em: "2026-09-20T15:00:00Z" };

// 1) Não concluído: repasse referenciado ao pedido, aguardando, sem conta da loja ainda.
await importar([pedido("A1", "enviado", "SHIPPED")]);
let c = await contaDo("A1");
const pA1 = await ped("A1");
confere("repasse grava a referência ao pedido", c && c.referencia_pedido_marketplace_id === pA1.id && c.aguardando_liberacao === true && c.status === "pendente");
confere("não concluído não cria conta nem lança nada", (await contasDe(u)) === 0 && (await movs("A1")).length === 0);

// 2) Concluído sem liberação: continua pendente (sem baixa) — e não é alerta (referência).
await importar([pedido("A1", "concluido", "COMPLETED")]);
c = await contaDo("A1");
confere("concluído sem escrow liberado: pendente, sem entrada", c.status === "pendente" && (await movs("A1")).length === 0);

// 3) Concluído e liberado: NADA entra no financeiro (o dono lança quando saca da Shopee).
await importar([pedido("A1", "concluido", "COMPLETED", LIBERADO)]);
await importar([pedido("A1", "concluido", "COMPLETED", LIBERADO)]);
c = await contaDo("A1");
confere("liberado: repasse continua pendente, sem conta nem lançamento", c.status === "pendente" && (await contasDe(u)) === 0 && (await movs("A1")).length === 0);
confere("liberado: referência ao pedido (nunca vira 'atrasado')", c.referencia_pedido_marketplace_id === pA1.id);

// 4) Devolvido/cancelado depois: nenhum lançamento.
await importar([pedido("A2", "concluido", "COMPLETED", LIBERADO)]);
await importar([pedido("A2", "devolvido", "TO_RETURN", { ...LIBERADO, repasse: 5 })]);
await importar([pedido("A2", "cancelado", "CANCELLED", { repasse: 0 })]);
confere("estorno/cancelamento não lança nada", (await movs("A2")).length === 0 && (await contasDe(u)) === 0);

// 5) Cancelado antes de concluir: repasse pendente sai, nada lançado.
await importar([pedido("C1", "a_enviar", "READY_TO_SHIP")]);
await importar([pedido("C1", "cancelado", "CANCELLED", { repasse: 0 })]);
confere("cancelado sem baixa: sem repasse e sem movimento", (await ped("C1")).conta_receber_id === null && (await movs("C1")).length === 0);

// 6) Dados antigos ao reaplicar a 0087 (2x): referência pela descrição; nada recebido nem
//    lançado; repasse órfão não vence.
const velha = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido OLD1', 10, '2026-09-01') returning id`, [u])).id;
await q(`insert into pedidos_marketplace (user_id, loja_id, numero, status, subtotal, repasse, escrow_liberado_em) values ($1, $2, 'OLD1', 'concluido', 12, 10, '2026-09-15T10:00:00Z')`, [u, loja]);
const orfa = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Repasse Cardoso e-Shop — pedido SUMIU', 10, '2026-08-01') returning id`, [u])).id;
const comum = (await um(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Venda fiado Maria', 10, '2026-08-01') returning id`, [u])).id;
await db.exec(await lerMigracao("0087_repasses_marketplace_sem_atraso.sql"));
await db.exec(await lerMigracao("0087_repasses_marketplace_sem_atraso.sql"));
await comoUsuario(u);
c = await um(`select * from contas_a_pagar_receber where id = $1`, [velha]);
confere("dados antigos: referência pela descrição + loja", c.referencia_pedido_marketplace_id === (await ped("OLD1")).id);
confere("dados antigos: continua pendente, sem lançamento", c.status === "pendente" && (await movs("OLD1")).length === 0 && (await contasDe(u)) === 0);
confere("repasse órfão fica aguardando (não vence)", (await um(`select aguardando_liberacao a from contas_a_pagar_receber where id = $1`, [orfa])).a === true);
confere("conta comum não é tocada", (await um(`select aguardando_liberacao a, referencia_pedido_marketplace_id r from contas_a_pagar_receber where id = $1`, [comum])).a === false);

// 7) Nenhum repasse pendente "vencível": todo pendente de repasse tem referência ou aguarda.
const vencivel = await um(`select count(*) n from contas_a_pagar_receber where status = 'pendente' and descricao like 'Repasse %' and referencia_pedido_marketplace_id is null and not aguardando_liberacao`);
confere("nenhum repasse pendente fica vencível", Number(vencivel.n) === 0);

// 8) Sem as funções de baixa automática; RLS isola os repasses.
const existe = async (f) => Number((await um(`select count(*) n from pg_proc where proname = $1`, [f])).n) > 0;
confere("sem baixa automática nem conta da loja", !(await existe("liquidar_repasse_marketplace")) && !(await existe("conta_financeira_da_loja")));
await db.exec(`set role authenticated`);
await comoUsuario(outro);
const vistasCpr = await q(`select id from contas_a_pagar_receber where referencia_pedido_marketplace_id is not null`);
await db.exec(`reset role`);
confere("outra conta não vê os repasses", vistasCpr.length === 0);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
