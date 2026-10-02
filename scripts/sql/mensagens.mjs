/** Registro de mensagens enviadas (0061). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('m@m.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('n@n.com') returning id`)).id;
for (const id of [u, outro]) await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
grant usage on schema public to authenticated; grant all on mensagens_enviadas to authenticated;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

await como(u, `insert into mensagens_enviadas (user_id, chave) values ($1, 'enviado:v1') on conflict do nothing`, [u]);
await como(u, `insert into mensagens_enviadas (user_id, chave) values ($1, 'enviado:v1') on conflict do nothing`, [u]);
confere("marcar duas vezes não duplica", (await um(`select count(*)::int n from mensagens_enviadas`)).n === 1);
confere("outra conta não vê o que foi enviado", (await como(outro, `select * from mensagens_enviadas`)).length === 0);

await db.exec(await lerMigracao("0061_mensagens_whatsapp.sql"));
confere("0061 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
