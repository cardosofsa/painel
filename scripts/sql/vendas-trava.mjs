/** Venda só muda pelas funções (0106): escrita direta pela API não mexe em dinheiro nem itens. Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};

const u = (await um(`insert into auth.users (email) values ('trava@v.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
await q(`insert into formas_pagamento (user_id, nome, tipo) values ($1, 'Pix', 'pix') on conflict do nothing`, [u]);
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'A', 'Camisa', 20, 50, 100) returning id`, [u])).id;
await um(`select definir_pin_admin('1234')`);

/** Simula a requisição do PostgREST: caminho e papel do JWT. */
const api = async (caminho, sql, p = [], papel = "authenticated") => {
  await db.exec(`select set_config('request.path', '${caminho}', false), set_config('request.jwt.claims', '{"role":"${papel}"}', false)`);
  try {
    return await q(sql, p);
  } finally {
    await db.exec(`select set_config('request.path', '', false), set_config('request.jwt.claims', '', false)`);
  }
};

// A venda nasce pela RPC (caminho /rpc/): passa.
const v = (await api("/rpc/registrar_venda", `select * from registrar_venda(p_itens => $1::jsonb, p_conta_id => $2, p_forma_pagamento => 'Pix')`, [JSON.stringify([{ produto_id: prod, quantidade: 2, preco_unitario: 50 }]), conta]))[0];
confere("registrar_venda pela RPC continua funcionando", Number(v.venda_total) === 100);
const item = (await um(`select id from venda_itens where venda_id = $1`, [v.venda_id])).id;

await espera("total não muda direto pela API", () => api("/vendas", `update vendas set total = 1 where id = $1`, [v.venda_id]), "só muda por “Editar venda”");
await espera("desconto não muda direto pela API", () => api("/vendas", `update vendas set desconto = 90 where id = $1`, [v.venda_id]), "desconto");
await espera("forma de pagamento não muda direto", () => api("/vendas", `update vendas set forma_pagamento = 'Fiado' where id = $1`, [v.venda_id]), "forma_pagamento");
await espera("venda não é apagada direto", () => api("/vendas", `delete from vendas where id = $1`, [v.venda_id]), "Cancelar venda");
await espera("item não muda direto", () => api("/venda_itens", `update venda_itens set preco_unitario = 1 where id = $1`, [item]), "itens de uma venda");
await espera("item não é inserido direto", () => api("/venda_itens", `insert into venda_itens (venda_id, produto_nome, quantidade, preco_unitario, custo_unitario) values ($1, 'X', 1, 1, 0)`, [v.venda_id]), "itens de uma venda");
await espera("item não é apagado direto", () => api("/venda_itens", `delete from venda_itens where id = $1`, [item]), "itens de uma venda");

await api("/vendas", `update vendas set etapa = 'enviar', logistica = 'Correios', rastreio = 'BR1', frete_custo = 12, observacao_interna = 'ok', tags = '{a}' where id = $1`, [v.venda_id]);
const depois = await um(`select etapa, logistica, frete_custo, total from vendas where id = $1`, [v.venda_id]);
confere("etapa, logística, rastreio, frete e observação interna seguem editáveis pela tela", depois.logistica === "Correios" && Number(depois.frete_custo) === 12 && Number(depois.total) === 100);

const r = (await api("/rpc/editar_venda", `select editar_venda($1, null, 'Pix', null, 10, 0, '1234') r`, [v.venda_id]))[0].r;
const t = await um(`select total from vendas where id = $1`, [v.venda_id]);
confere("editar_venda com PIN muda o total", Number(t.total) === 90, JSON.stringify(r).slice(0, 80));
await api("/rpc/cancelar_venda", `select cancelar_venda($1)`, [v.venda_id]).then(
  () => confere("cancelar_venda pela RPC funciona", true),
  (e) => confere("cancelar_venda pela RPC funciona", false, e.message),
);
// Apagar pela tela um produto e um cliente que já venderam: a venda perde só a referência.
const p2 = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'B', 'Boné', 5, 20, 10) returning id`, [u])).id;
const cli = (await um(`insert into clientes (user_id, nome) values ($1, 'Bia') returning id`, [u])).id;
const v2 = (await api("/rpc/registrar_venda", `select * from registrar_venda(p_itens => $1::jsonb, p_conta_id => $2, p_forma_pagamento => 'Pix', p_cliente_id => $3)`, [JSON.stringify([{ produto_id: p2, quantidade: 1, preco_unitario: 20 }]), conta, cli]))[0];
await api("/produtos", `delete from produtos where id = $1`, [p2]).then(
  () => confere("apagar produto que já vendeu continua possível (cascata)", true),
  (e) => confere("apagar produto que já vendeu continua possível (cascata)", false, e.message),
);
await api("/clientes", `delete from clientes where id = $1`, [cli]).then(
  () => confere("apagar cliente com venda continua possível (cascata)", true),
  (e) => confere("apagar cliente com venda continua possível (cascata)", false, e.message),
);
confere("a venda continua com o mesmo total", Number((await um(`select total from vendas where id = $1`, [v2.venda_id])).total) === 20);

await api("/vendas", `update vendas set observacao_interna = 'svc' where id = $1`, [v.venda_id], "service_role");
await api("/vendas", `update vendas set total = 5 where id = $1`, [v.venda_id], "service_role");
confere("service role (cron, webhook) não passa pela trava", Number((await um(`select total from vendas where id = $1`, [v.venda_id])).total) === 5);
await q(`update vendas set total = 7 where id = $1`, [v.venda_id]);
confere("SQL fora da API (SQL Editor) não passa pela trava", Number((await um(`select total from vendas where id = $1`, [v.venda_id])).total) === 7);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
