/** Compras a prazo e histórico de pagamentos; "fiado" → "crediário" (0064). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const espera = async (nome, fn, trecho) => {
  try {
    await fn();
    confere(nome, false, "devia ter dado erro");
  } catch (e) {
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 100));
  }
};

const u = (await um(`insert into auth.users (email) values ('c@c.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('o@o.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
const entrar = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
await entrar(u);

const caixa = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 1000) returning id`, [u])).id;
const forn = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Atacado Sol') returning id`, [u])).id;
const saldo = async () => Number((await um(`select saldo from contas where id = $1`, [caixa])).saldo);
const pedido = async (total, data = "2026-10-01") =>
  (await um(`insert into pedidos_compra (user_id, fornecedor_id, valor_total, status, data_pedido) values ($1, $2, $3, 'pendente', $4) returning id, numero`, [u, forn, total, data])).id;
const parcelas = (p) => q(`select * from contas_a_pagar_receber where referencia_pedido_compra_id = $1 order by parcela_numero`, [p]);

// 1) A prazo em 3x de R$ 100 → 33,33 + 33,33 + 33,34, mensal.
const p1 = await pedido(100);
await q(`select gerar_pagamento_compra($1, true, 3, '2026-11-01', 30, $2)`, [p1, caixa]);
const ps1 = await parcelas(p1);
const soma = ps1.reduce((s, r) => s + Number(r.valor), 0);
confere("3 parcelas somam o total exato", ps1.length === 3 && Math.abs(soma - 100) < 0.001 && Number(ps1[2].valor) === 33.34, ps1.map((r) => r.valor).join(", "));
confere("vencimentos mensais e número/total gravados", ps1.map((r) => r.data_vencimento.toISOString().slice(0, 10)).join() === "2026-11-01,2026-12-01,2027-01-01" && ps1[1].parcela_numero === 2 && ps1[1].total_parcelas === 3);
confere("a prazo não mexe no caixa ao lançar", (await saldo()) === 1000);
await espera("não gera parcelas duas vezes", () => q(`select gerar_pagamento_compra($1, true, 3, '2026-11-01', 30, $2)`, [p1, caixa]), "já tem parcelas");

// 2) Pagamento parcial, depois o resto.
await q(`select pagar_conta($1, 20, '2026-10-02', $2)`, [ps1[0].id, caixa]);
let r = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [ps1[0].id]);
confere("pagou R$ 20 de 33,33: segue pendente com valor_pago 20", r.status === "pendente" && Number(r.valor_pago) === 20);
confere("caixa caiu R$ 20", (await saldo()) === 980);
await q(`select pagar_conta($1, 13.33, '2026-10-03', $2)`, [ps1[0].id, caixa]);
r = await um(`select status, valor_pago, data_pagamento from contas_a_pagar_receber where id = $1`, [ps1[0].id]);
confere("completou: quitada, com data do último pagamento", r.status === "pago" && r.data_pagamento.toISOString().slice(0, 10) === "2026-10-03");
confere("histórico com 2 pagamentos", (await um(`select count(*)::int n from pagamentos_conta where conta_pr_id = $1`, [ps1[0].id])).n === 2);
const mov = await um(`select categoria, valor from movimentacoes_financeiras where referencia_pedido_compra_id = $1 order by criado_em limit 1`, [p1]);
confere("lançamento como 'Compra de mercadoria' (saída)", mov.categoria === "Compra de mercadoria" && Number(mov.valor) === -20);
await espera("não paga parcela já quitada", () => q(`select pagar_conta($1, 1, null, $2)`, [ps1[0].id, caixa]), "já está quitada");

// 3) Desconto: paga 30 de 33,33 e dá por quitada.
await q(`select pagar_conta($1, 30, '2026-10-04', $2, true)`, [ps1[1].id, caixa]);
r = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [ps1[1].id]);
confere("quitar com desconto", r.status === "pago" && Number(r.valor_pago) === 30);

// 4) Estorno devolve o dinheiro e reabre a parcela.
const antes = await saldo();
const pag = (await um(`select id from pagamentos_conta where conta_pr_id = $1`, [ps1[1].id])).id;
await q(`select estornar_pagamento_conta($1)`, [pag]);
r = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [ps1[1].id]);
confere("estorno: parcela pendente de novo e caixa de volta", r.status === "pendente" && Number(r.valor_pago) === 0 && (await saldo()) === antes + 30);

// 5) À vista já nasce paga.
const p2 = await pedido(50);
await q(`select gerar_pagamento_compra($1, false, null, null, null, $2)`, [p2, caixa]);
const ps2 = await parcelas(p2);
confere("à vista: 1 parcela já paga", ps2.length === 1 && ps2[0].status === "pago" && Number(ps2[0].valor_pago) === 50);

// 6) Cancelar com parcela paga em parte: a paga fica, a intocada sai.
const p3 = await pedido(90);
await q(`select gerar_pagamento_compra($1, true, 3, '2026-11-10', 15, $2)`, [p3, caixa]);
const ps3 = await parcelas(p3);
confere("intervalo de 15 dias", ps3[1].data_vencimento.toISOString().slice(0, 10) === "2026-11-25");
await q(`select pagar_conta($1, 10, null, $2)`, [ps3[0].id, caixa]);
await q(`select cancelar_pedido_compra($1)`, [p3]);
const restantes = await parcelas(p3);
confere("cancelar: só a parcela com pagamento fica (encerrada)", restantes.length === 1 && restantes[0].status === "pago" && Number(restantes[0].valor_pago) === 10);

const aberto = await um(`select * from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn]);
confere("em aberto por fornecedor (p1: 33,33 + 33,34; p2 e p3 fechados)", Math.abs(Number(aberto.em_aberto) - 66.67) < 0.001, JSON.stringify(aberto));

// 7) Isolamento: outra conta não vê nem paga.
await entrar(outro);
await db.exec(`set role authenticated`);
try {
  const visto = await q(`select * from pagamentos_conta`);
  confere("outra conta não vê o histórico", visto.length === 0);
  await espera("outra conta não paga parcela alheia", () => q(`select pagar_conta($1, 1, null, $2)`, [ps1[2].id, caixa]), "não encontrada");
} finally {
  await db.exec(`reset role`);
}
await entrar(u);

// 8) Crediário: descrição nova já sai com o nome novo.
await q(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento) values ($1, 'receber', 'Fiado — venda V-0001', 10, '2026-10-10')`, [u]);
confere("prefixo 'Fiado' vira 'Crediário'", (await um(`select descricao from contas_a_pagar_receber where tipo = 'receber' order by criado_em desc limit 1`)).descricao === "Crediário — venda V-0001");

await db.exec(await lerMigracao("0064_compras_a_prazo.sql"));
confere("0064 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
