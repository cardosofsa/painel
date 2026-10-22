/** Faixa de margem por produto (0114). Rode com `npm run test:sql`. */
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


const u = await novoUsuario("margem@e.com");
const outro = await novoUsuario("margem2@e.com");

const prod = (await como(u, `insert into produtos (sku, nome, custo_base) values ('CAN', 'Caneca', 10) returning id, margem_minima, margem_maxima`))[0];
confere("produto sem faixa continua valendo (colunas nulas)", prod.margem_minima === null && prod.margem_maxima === null);
const r = (await como(u, `update produtos set margem_minima = 0.2, margem_maxima = 0.3 where id = $1 returning margem_minima, margem_maxima`, [prod.id]))[0];
confere("produto guarda a faixa", Number(r.margem_minima) === 0.2 && Number(r.margem_maxima) === 0.3);
const igual = (await como(u, `update produtos set margem_minima = 0.25, margem_maxima = 0.25 where id = $1 returning margem_minima`, [prod.id]))[0];
confere("mínimo igual ao máximo vale", Number(igual.margem_minima) === 0.25);
await espera("mínimo maior que o máximo é recusado", () => como(u, `update produtos set margem_minima = 0.3, margem_maxima = 0.2 where id = $1`, [prod.id]), "violates check");
await espera("margem negativa é recusada", () => como(u, `update produtos set margem_minima = -0.1 where id = $1`, [prod.id]), "violates check");
await espera("margem de 90% ou mais é recusada", () => como(u, `update produtos set margem_maxima = 0.9 where id = $1`, [prod.id]), "violates check");

const mudou = await como(outro, `update produtos set margem_minima = 0 where id = $1 returning id`, [prod.id]);
confere("outra conta não muda a faixa alheia", mudou.length === 0);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
