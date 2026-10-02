/** Operadores com PIN (0063). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const erro = async (sql, p = []) => {
  try {
    await db.query(sql, p);
    return null;
  } catch (e) {
    return e.message;
  }
};

const u = (await um(`insert into auth.users (email) values ('e@e.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('x@x.com') returning id`)).id;
for (const id of [u, outro]) await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

const ana = (await um(`select salvar_operador(null, 'Ana', '1234', array['pdv','vendas'], 5, 'venda', true) as id`)).id;
confere("cria operador com PIN guardado em hash", !!ana && (await um(`select pin_hash <> '1234' as ok from operadores where id = $1`, [ana])).ok);
confere("PIN fora do padrão é recusado", /4 a 6 números/.test((await erro(`select salvar_operador(null, 'Bia', '12', null, 0, 'venda', true)`)) ?? ""));

const ok = await um(`select * from entrar_operador($1, '1234')`, [ana]);
confere("PIN certo entra e devolve nome e telas", ok?.nome === "Ana" && ok.abas.join() === "pdv,vendas", JSON.stringify(ok));
confere("PIN errado recusa", /PIN incorreto/.test((await erro(`select * from entrar_operador($1, '9999')`, [ana])) ?? ""));

// Hash invisível para a API (papel authenticated).
await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
grant usage on schema public to authenticated;`);
await db.exec(`set role authenticated`);
const semHash = await erro(`select pin_hash from operadores`);
const nomes = await db.query(`select nome from operadores`).then((r) => r.rows).catch((e) => e.message);
await db.exec(`reset role`);
confere("a API não lê o hash do PIN", /permission denied/.test(semHash ?? ""), semHash ?? "leu!");
confere("mas lê nome e telas", Array.isArray(nomes) && nomes.length === 1, JSON.stringify(nomes));

// PIN de administrador protege a equipe.
await q(`insert into perfil_negocio (user_id, pin_admin_hash) values ($1, crypt('4321', gen_salt('bf'))) on conflict (user_id) do update set pin_admin_hash = excluded.pin_admin_hash`, [u]);
confere("com PIN de administrador, mexer na equipe sem ele é recusado", /administrador incorreto/.test((await erro(`select salvar_operador($1, 'Ana', null, array['pdv'], 5, 'venda', true, '0000')`, [ana])) ?? ""));
await q(`select salvar_operador($1, 'Ana', null, array['pdv'], 7, 'lucro', true, '4321')`, [ana]);
confere("com o PIN certo, altera", (await um(`select comissao_pct, comissao_base from operadores where id = $1`, [ana])).comissao_base === "lucro");
await q(`select definir_exigir_operador(true, '4321')`);
confere("exigir operador ligado", (await um(`select exigir_operador from perfil_negocio where user_id = $1`, [u])).exigir_operador === true);

// Operador na venda: só da própria conta.
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const prod = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'P', 'P', 1, 10, 5) returning id`, [u])).id;
const v = await um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix')`, [JSON.stringify([{ produto_id: prod, quantidade: 1, preco_unitario: 10 }]), conta]);
await q(`select marcar_operador_venda($1, $2)`, [v.venda_id, ana]);
confere("venda guarda o operador", (await um(`select operador_id from vendas where id = $1`, [v.venda_id])).operador_id === ana);
await db.exec(`select set_config('request.jwt.claim.sub', '${outro}', false)`);
confere("outra conta não entra com operador alheio", /PIN incorreto/.test((await erro(`select * from entrar_operador($1, '1234')`, [ana])) ?? ""));
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

await db.exec(await lerMigracao("0063_operadores.sql"));
confere("0063 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
