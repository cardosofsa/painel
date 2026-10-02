/** PDV sem internet (0060): uma venda por chave, com a data real. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('o@o.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'o@o.com', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'X', 'Pulseira', 3, 10, 20) returning id`, [u])).id;

const chave = "8c6f1f0e-5b5e-4a43-9d6b-7a1a2f9e0c11";
const feita = new Date(Date.now() - 3 * 3600_000).toISOString();
const enviar = () =>
  um(`select * from registrar_venda_offline(p_chave => $1, p_feita_em => $2, p_itens => $3::jsonb, p_status => 'paga', p_conta_id => $4, p_forma_pagamento => 'Dinheiro')`, [
    chave,
    feita,
    JSON.stringify([{ produto_id: prod, quantidade: 2, preco_unitario: 10 }]),
    conta,
  ]);

const r1 = await enviar();
const r2 = await enviar();
const n = (await um(`select count(*)::int n from vendas`)).n;
const est = (await um(`select estoque from produtos where id = $1`, [prod])).estoque;
confere("primeira vez cria a venda", r1.ja_enviada === false && !!r1.venda_numero, JSON.stringify(r1));
confere("reenviar a mesma chave devolve a MESMA venda, sem duplicar nem baixar de novo", r2.ja_enviada === true && r2.venda_id === r1.venda_id && n === 1 && est === 18, `vendas ${n}, estoque ${est}`);
const data = (await um(`select data_venda from vendas where id = $1`, [r1.venda_id])).data_venda;
confere("a venda fica com o horário real (de quando estava sem internet)", Math.abs(new Date(data).getTime() - new Date(feita).getTime()) < 1000, String(data));

await db.exec(await lerMigracao("0060_pdv_offline.sql"));
confere("0060 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
