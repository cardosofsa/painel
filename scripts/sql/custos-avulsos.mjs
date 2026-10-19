/** Custos avulsos (0112): isolados por conta, nome único, histórico de preço só por trigger. Rode com `npm run test:sql`. */
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
const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
  return id;
};
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const u = await novoUsuario("custos@e.com");
const outro = await novoUsuario("custos2@e.com");

const c = (await como(u, `insert into custos_avulsos (nome, unidade, custo, grupo) values ('Chimichury', 'kg', 24, 'Temperos') returning id, ativo`))[0];
confere("grava custo, ativo por padrão", !!c.id && c.ativo === true);
await espera("nome repetido (sem diferenciar maiúscula) é recusado", () => como(u, `insert into custos_avulsos (nome, custo) values ('  chimichury ', 10)`), "duplicate key");
await como(outro, `insert into custos_avulsos (nome, custo) values ('Chimichury', 10)`);
confere("outra conta pode ter o mesmo nome", true);
await espera("unidade desconhecida é recusada", () => como(u, `insert into custos_avulsos (nome, unidade, custo) values ('X', 'g', 1)`), "violates check");
await espera("custo negativo é recusado", () => como(u, `insert into custos_avulsos (nome, custo) values ('Y', -1)`), "violates check");
await espera("nome vazio é recusado", () => como(u, `insert into custos_avulsos (nome, custo) values ('  ', 1)`), "violates check");

await como(u, `update custos_avulsos set custo = 26.5 where id = $1`, [c.id]);
await como(u, `update custos_avulsos set grupo = 'Pós' where id = $1`, [c.id]);
const hist = await como(u, `select custo_anterior, custo_novo from custos_avulsos_historico where custo_id = $1`, [c.id]);
confere("mudar o custo grava o histórico (e mudar só o grupo não)", hist.length === 1 && Number(hist[0].custo_anterior) === 24 && Number(hist[0].custo_novo) === 26.5);
await espera("dono não grava histórico à mão", () => como(u, `insert into custos_avulsos_historico (user_id, custo_id, custo_anterior, custo_novo) values ($1, $2, 1, 2)`, [u, c.id]), "row-level security");

confere("outra conta não vê os custos", (await como(outro, `select count(*)::int n from custos_avulsos where id = $1`, [c.id]))[0].n === 0);
confere("outra conta não vê o histórico", (await como(outro, `select count(*)::int n from custos_avulsos_historico`))[0].n === 0);
await como(outro, `update custos_avulsos set custo = 0 where id = $1`, [c.id]);
confere("outra conta não altera o custo", Number((await como(u, `select custo from custos_avulsos where id = $1`, [c.id]))[0].custo) === 26.5);
await espera("não grava custo em nome de outra conta", () => como(outro, `insert into custos_avulsos (user_id, nome, custo) values ($1, 'Z', 1)`, [u]), "row-level security");
await como(u, `update custos_avulsos set user_id = $2 where id = $1`, [c.id, outro]).catch(() => {});
confere("não passa o custo para outra conta", (await como(u, `select count(*)::int n from custos_avulsos where id = $1`, [c.id]))[0].n === 1);

await como(u, `delete from custos_avulsos where id = $1`, [c.id]);
confere("apagar o custo apaga o histórico", (await como(u, `select count(*)::int n from custos_avulsos_historico`))[0].n === 0);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
