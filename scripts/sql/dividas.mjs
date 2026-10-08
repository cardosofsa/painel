/** Dívidas e contas antigas ligadas a fornecedor/cliente (0067). Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('d@d.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('o2@o.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
const entrar = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);

await entrar(outro);
const fornAlheio = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Alheio') returning id`, [outro])).id;
await entrar(u);

const caixa = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 500) returning id`, [u])).id;
const forn = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Atacado Sol') returning id`, [u])).id;
const cliente = (await um(`insert into clientes (user_id, nome, permite_fiado, limite_fiado) values ($1, 'Bia', true, 400) returning id`, [u])).id;
const saldo = async () => Number((await um(`select saldo from contas where id = $1`, [caixa])).saldo);
const movs = async () => (await um(`select count(*)::int n from movimentacoes_financeiras where user_id = $1`, [u])).n;
const movsAntes = await movs();

// 1) R$ 300 em 3x com R$ 50 já pagos (0086): o já pago vira um lançamento quitado à parte e
//    as parcelas dividem os 250 em aberto: 83,33 + 83,33 + 83,34.
const n = (await um(`select lancar_divida_antiga('pagar', $1, null, 'Saldo anterior', 300, 3, '2026-11-05', 30, 50, $2) n`, [forn, caixa])).n;
const ps = await q(`select * from contas_a_pagar_receber where fornecedor_id = $1 and parcela_numero is not null order by parcela_numero`, [forn]);
const jaPagoLinha = await um(`select * from contas_a_pagar_receber where fornecedor_id = $1 and parcela_numero is null`, [forn]);
confere("gera 3 parcelas", n === 3 && ps.length === 3);
confere("parcelas dividem só o em aberto", ps.map((p) => `${Number(p.valor)}/${Number(p.valor_pago)}`).join(" ") === "83.33/0 83.33/0 83.34/0", ps.map((p) => `${p.valor}/${p.valor_pago}`).join(" "));
confere("já pago fica registrado quitado à parte", Number(jaPagoLinha?.valor) === 50 && jaPagoLinha?.status === "pago" && jaPagoLinha?.descricao === "Saldo anterior — já pago antes", JSON.stringify(jaPagoLinha?.descricao));
confere("vencimentos mensais", ps.map((p) => p.data_vencimento.toISOString().slice(0, 10)).join() === "2026-11-05,2026-12-05,2027-01-05");
confere("marcadas como saldo inicial e com descrição da parcela", ps.every((p) => p.origem_saldo_inicial) && ps[1].descricao === "Saldo anterior — parcela 2/3");
confere("NÃO mexe no caixa nem cria lançamento", (await saldo()) === 500 && (await movs()) === movsAntes);

// 2) Fornecedores → "Em aberto" passa a ver a conta ligada direto.
const ab = await um(`select * from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn]);
confere("em aberto = 250", Number(ab?.em_aberto) === 250, String(ab?.em_aberto));
// ...e continua somando parcela de pedido de compra.
const ped = (await um(`insert into pedidos_compra (user_id, fornecedor_id, valor_total, status, data_pedido) values ($1, $2, 90, 'pendente', '2026-10-01') returning id`, [u, forn])).id;
await q(`select gerar_pagamento_compra($1, true, 1, '2026-11-20', 30, $2)`, [ped, caixa]);
confere("pedido + dívida antiga = 340", Number((await um(`select em_aberto from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn])).em_aberto) === 340);

// 3) Pagar uma parcela antiga depois sai do caixa normalmente (é pagamento de hoje).
await q(`select pagar_conta($1, 83.33, null, $2)`, [ps[0].id, caixa]);
confere("pagar a 1ª parcela: quitada e caixa -83,33", (await um(`select status from contas_a_pagar_receber where id = $1`, [ps[0].id])).status === "pago" && (await saldo()) === 416.67, String(await saldo()));

// 4) Tudo já pago: nasce quitada.
await q(`select lancar_divida_antiga('pagar', $1, null, 'Já quitada', 80, 1, '2026-01-10', 30, 80)`, [forn]);
confere("já paga inteira nasce 'pago'", (await um(`select status from contas_a_pagar_receber where descricao = 'Já quitada'`)).status === "pago");

// 5) Arredondamento: R$ 100 em 3x = 33,33 + 33,33 + 33,34.
await q(`select lancar_divida_antiga('pagar', $1, null, 'Arredonda', 100, 3, '2026-11-01', 15)`, [forn]);
const arr = await q(`select valor, data_vencimento from contas_a_pagar_receber where descricao like 'Arredonda%' order by parcela_numero`);
confere("sobra na última parcela e intervalo de 15 dias", arr.map((r) => Number(r.valor)).join() === "33.33,33.33,33.34" && arr[1].data_vencimento.toISOString().slice(0, 10) === "2026-11-16");

// 6) Crediário antigo do cliente: entra no limite.
await q(`select lancar_divida_antiga('receber', null, $1, 'Crediário antigo', 300, 2, '2026-09-01', 30, 0)`, [cliente]);
confere("limite em uso = 300", Number((await um(`select fiado_em_uso_cliente($1) v`, [cliente])).v) === 300);
const cpr = await um(`select id from contas_a_pagar_receber where cliente_id = $1 order by parcela_numero limit 1`, [cliente]);
await q(`select receber_conta($1, 60, null, $2)`, [cpr.id, caixa]);
confere("recebeu 60 de 150: em uso cai para 240 (antes contava o valor cheio)", Number((await um(`select fiado_em_uso_cliente($1) v`, [cliente])).v) === 240);
const mov = await um(`select origem, categoria from movimentacoes_financeiras where descricao like 'Crediário antigo%' order by criado_em desc limit 1`);
confere("recebimento entra como crediário", mov.origem === "Crediário" && mov.categoria === "Recebimento de crediário");
const camisa = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'C1', 'Camisa', 20, 200, 10) returning id`, [u])).id;
await espera(
  "venda no crediário respeita o limite com a dívida antiga (400 - 240 = 160 livres)",
  () => q(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'fiado', p_conta_id => $2, p_cliente_id => $3)`, [JSON.stringify([{ produto_id: camisa, quantidade: 1, preco_unitario: 200 }]), caixa, cliente]),
  "Limite",
);

// 7) Validações.
// RLS de verdade (o superusuário do PGlite ignora RLS): a trava de dono olha só o que a conta enxerga.
await db.exec(`set role authenticated`);
try {
  await espera("fornecedor de outra conta é recusado", () => q(`select lancar_divida_antiga('pagar', $1, null, 'x', 10, 1, '2026-11-01')`, [fornAlheio]), "não pertence");
  await espera("UPDATE apontando para fornecedor alheio também", () => q(`update contas_a_pagar_receber set fornecedor_id = $1 where fornecedor_id = $2`, [fornAlheio, forn]), "não pertence");
} finally {
  await db.exec(`reset role`);
}
await espera("já pago maior que o total", () => q(`select lancar_divida_antiga('pagar', $1, null, 'x', 10, 1, '2026-11-01', 30, 11)`, [forn]), "não pode passar");
await espera("pagar com cliente", () => q(`select lancar_divida_antiga('pagar', null, $1, 'x', 10, 1, '2026-11-01')`, [cliente]), "fornecedor, não a cliente");
await espera("sem descrição", () => q(`select lancar_divida_antiga('pagar', $1, null, '  ', 10, 1, '2026-11-01')`, [forn]), "Descreva");
await espera("49 parcelas", () => q(`select lancar_divida_antiga('pagar', $1, null, 'x', 100, 49, '2026-11-01')`, [forn]), "48");

// 8) Isolamento: outra conta não vê nem soma.
await entrar(outro);
await db.exec(`set role authenticated`);
try {
  confere("outra conta não vê o em aberto", (await q(`select * from em_aberto_por_fornecedor()`)).length === 0);
} finally {
  await db.exec(`reset role`);
}
await entrar(u);

await db.exec(await lerMigracao("0067_dividas_antigas.sql"));
confere("0067 roda 2x sem erro", true);
confere("depois de rodar 2x, em aberto continua certo", Number((await um(`select em_aberto from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn])).em_aberto) === 356.67);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
