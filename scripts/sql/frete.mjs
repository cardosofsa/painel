/** Frete (0055): RLS de frete_conexoes e colunas novas. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('a@a.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('b@b.com') returning id`)).id;
for (const id of [u, outro]) await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);

// RLS de verdade: papel authenticated (o superusuário do PGlite ignora RLS).
await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
grant usage on schema public to authenticated; grant all on frete_conexoes to authenticated;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return await db.query(sql, p);
  } finally {
    await db.exec(`reset role`);
  }
};

await como(u, `insert into frete_conexoes (user_id, token_cifrado, cep_origem, servicos, acrescimo) values ($1, 'v1.x', '44000000', '{1,2}', 2.5)`, [u]);
confere("dono grava a própria conexão", (await um(`select count(*)::int n from frete_conexoes`)).n === 1);
const visto = await como(outro, `select * from frete_conexoes`);
confere("outra conta não vê o token alheio", visto.rows.length === 0);
let erro = null;
try {
  await como(outro, `insert into frete_conexoes (user_id, cep_origem) values ($1, '44000000')`, [u]);
} catch (e) {
  erro = e.message;
}
confere("outra conta não grava em nome do dono", !!erro);
erro = null;
try {
  await como(u, `update frete_conexoes set cep_origem = '440' where user_id = $1`, [u]);
} catch (e) {
  erro = e.message;
}
confere("CEP de origem precisa de 8 dígitos", !!erro);

const cols = (await db.query(`select table_name, column_name from information_schema.columns where column_name in ('frete_valor','frete_etiqueta_id','rastreio') and table_name in ('vendas','pedidos_vitrine')`)).rows.map((r) => `${r.table_name}.${r.column_name}`).sort();
confere("colunas de frete", cols.join() === "pedidos_vitrine.frete_valor,vendas.frete_etiqueta_id,vendas.rastreio", cols.join());

const cat = await um(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-frete') returning id`, [u]);
confere("vitrine sem frete na vitrine: false", (await um(`select vitrine_tem_frete('loja-frete') as t`)).t === false);
await db.query(`update frete_conexoes set na_vitrine = true where user_id = $1`, [u]);
confere("vitrine com frete: true; slug inexistente: false", (await um(`select vitrine_tem_frete('loja-frete') as t`)).t === true && (await um(`select vitrine_tem_frete('nada') as t`)).t === false, cat.id);

await db.exec(await lerMigracao("0055_frete.sql"));
confere("0055 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
